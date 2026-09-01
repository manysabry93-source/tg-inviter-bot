// ─── Database Layer ───────────────────────────────────────────────────────────

// Settings
export async function getSetting(DB, key) {
  const r = await DB.prepare('SELECT value FROM bot_settings WHERE key=?').bind(key).first();
  return r ? r.value : null;
}
export async function setSetting(DB, key, value) {
  await DB.prepare('INSERT OR REPLACE INTO bot_settings (key,value) VALUES (?,?)').bind(key, value).run();
}

// Users
export async function saveUser(DB, user) {
  await DB.prepare(`INSERT INTO users (user_id,username,first_name,last_name,last_seen)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,
    first_name=excluded.first_name, last_name=excluded.last_name, last_seen=excluded.last_seen`)
    .bind(user.id, user.username||null, user.first_name||null, user.last_name||null).run();
}
export async function getAllUserIds(DB) {
  const {results} = await DB.prepare('SELECT user_id FROM users').all();
  return results.map(r => r.user_id);
}
export async function getUserCount(DB) {
  const r = await DB.prepare('SELECT COUNT(*) as c FROM users').first();
  return r.c;
}

// Admins
export async function isAdmin(DB, userId) {
  const r = await DB.prepare('SELECT user_id FROM admins WHERE user_id=?').bind(userId).first();
  return !!r;
}
export async function isSuperAdmin(DB, userId) {
  const r = await DB.prepare('SELECT user_id FROM admins WHERE user_id=? AND is_super=1').bind(userId).first();
  return !!r;
}
export async function addAdmin(DB, userId, username, isSuper=0) {
  await DB.prepare('INSERT OR IGNORE INTO admins (user_id,username,is_super) VALUES (?,?,?)').bind(userId, username||null, isSuper).run();
}
export async function removeAdmin(DB, userId) {
  await DB.prepare('DELETE FROM admins WHERE user_id=? AND is_super=0').bind(userId).run();
}
export async function getAllAdmins(DB) {
  const {results} = await DB.prepare('SELECT user_id,username,is_super FROM admins').all();
  return results;
}

// Sessions
export async function getSession(DB, userId) {
  const r = await DB.prepare('SELECT data FROM sessions WHERE user_id=?').bind(userId).first();
  if (!r) return null;
  try { return JSON.parse(r.data); } catch { return null; }
}
export async function setSession(DB, userId, data) {
  await DB.prepare(`INSERT INTO sessions (user_id,data,updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`)
    .bind(userId, JSON.stringify(data)).run();
}
export async function clearSession(DB, userId) {
  await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
}

// Menu Nodes
export async function getNodes(DB) {
  const {results} = await DB.prepare('SELECT * FROM menu_nodes ORDER BY sort_order ASC').all();
  const nodes = {};
  for (const n of results) {
    nodes[n.id] = {
      ...n,
      children: [],
      files: [],
    };
  }
  // Build children
  for (const n of results) {
    if (n.parent_id && nodes[n.parent_id]) {
      nodes[n.parent_id].children.push(n.id);
    }
  }
  // Load files
  const {results: files} = await DB.prepare('SELECT * FROM menu_files ORDER BY sort_order ASC').all();
  for (const f of files) {
    if (nodes[f.node_id]) nodes[f.node_id].files.push(f);
  }
  return nodes;
}
export async function getNode(DB, id) {
  const nodes = await getNodes(DB);
  return nodes[id] || null;
}
export async function saveNode(DB, node) {
  await DB.prepare(`INSERT INTO menu_nodes (id,parent_id,title,type,content,url,form_key,enabled,sort_order,columns,access_mode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, title=excluded.title,
    type=excluded.type, content=excluded.content, url=excluded.url, form_key=excluded.form_key,
    enabled=excluded.enabled, sort_order=excluded.sort_order, columns=excluded.columns, access_mode=excluded.access_mode`)
    .bind(node.id, node.parent_id||null, node.title, node.type||'text',
      node.content||null, node.url||null, node.form_key||null,
      node.enabled!==false?1:0, node.sort_order||0, node.columns||2, node.access_mode||'everyone').run();
}
export async function deleteNode(DB, id) {
  // Delete recursively
  const nodes = await getNodes(DB);
  async function del(nid) {
    const n = nodes[nid];
    if (!n) return;
    for (const cid of (n.children||[])) await del(cid);
    await DB.prepare('DELETE FROM menu_files WHERE node_id=?').bind(nid).run();
    await DB.prepare('DELETE FROM menu_access_users WHERE node_id=?').bind(nid).run();
    await DB.prepare('DELETE FROM menu_nodes WHERE id=?').bind(nid).run();
  }
  await del(id);
  // Remove from parent's children order (handled by parent_id FK implicitly)
}
export async function genNodeId() {
  return 'n' + Math.random().toString(36).slice(2, 9);
}

// Forms
export async function getForms(DB) {
  const {results} = await DB.prepare('SELECT * FROM forms').all();
  const out = {};
  for (const f of results) {
    out[f.id] = { ...f, steps: JSON.parse(f.steps||'[]') };
  }
  return out;
}
export async function getForm(DB, id) {
  const r = await DB.prepare('SELECT * FROM forms WHERE id=?').bind(id).first();
  if (!r) return null;
  return { ...r, steps: JSON.parse(r.steps||'[]') };
}
export async function saveForm(DB, id, title, steps) {
  await DB.prepare('INSERT OR REPLACE INTO forms (id,title,steps) VALUES (?,?,?)').bind(id, title, JSON.stringify(steps)).run();
}
export async function saveFormResponse(DB, formId, userId, username, firstName, data) {
  await DB.prepare('INSERT INTO form_responses (form_id,user_id,username,first_name,data) VALUES (?,?,?,?,?)').bind(formId, userId, username||null, firstName||null, JSON.stringify(data)).run();
}

// Anon QA
export async function saveAnonQuestion(DB, userId, refMsgId, question) {
  await DB.prepare('INSERT INTO anon_questions (user_id,ref_message_id,question) VALUES (?,?,?)').bind(userId, String(refMsgId), question).run();
}
export async function getAnonQuestion(DB, refMsgId) {
  return await DB.prepare('SELECT * FROM anon_questions WHERE ref_message_id=?').bind(String(refMsgId)).first();
}

// Gate
export async function getGateChannels(DB) {
  const {results} = await DB.prepare('SELECT * FROM gate_channels').all();
  return results;
}
export async function addGateChannel(DB, channelId, title, link) {
  await DB.prepare('INSERT OR IGNORE INTO gate_channels (channel_id,channel_title,invite_link) VALUES (?,?,?)').bind(channelId, title, link).run();
}
export async function removeGateChannel(DB, id) {
  await DB.prepare('DELETE FROM gate_channels WHERE id=?').bind(id).run();
}

// Ad Groups
export async function getAdGroups(DB) {
  const {results} = await DB.prepare('SELECT * FROM ad_groups WHERE is_active=1').all();
  return results;
}
export async function addAdGroup(DB, groupId, title) {
  await DB.prepare('INSERT OR REPLACE INTO ad_groups (group_id,group_title,is_active) VALUES (?,?,1)').bind(groupId, title).run();
}
export async function removeAdGroup(DB, id) {
  await DB.prepare('DELETE FROM ad_groups WHERE id=?').bind(id).run();
}
export async function isAdGroup(DB, groupId) {
  const r = await DB.prepare('SELECT id FROM ad_groups WHERE group_id=? AND is_active=1').bind(groupId).first();
  return !!r;
}
export async function wasAdSentRecently(DB, userId, hours) {
  const r = await DB.prepare(`SELECT id FROM ad_sent_log WHERE user_id=? AND datetime(sent_at) > datetime('now', ? || ' hours') LIMIT 1`).bind(userId, `-${hours}`).first();
  return !!r;
}
export async function logAdSent(DB, userId, groupId) {
  await DB.prepare('INSERT INTO ad_sent_log (user_id,group_id) VALUES (?,?)').bind(userId, groupId).run();
}
export async function getAdStats(DB) {
  const total = await DB.prepare('SELECT COUNT(*) as c FROM ad_sent_log').first();
  const today = await DB.prepare("SELECT COUNT(*) as c FROM ad_sent_log WHERE DATE(sent_at)=DATE('now')").first();
  const joins = await DB.prepare('SELECT COUNT(*) as c FROM join_request_log WHERE approved=1').first();
  return { adSent: total.c, adToday: today.c, joinApproved: joins.c };
}

// Join Request
export async function logJoinRequest(DB, userId, username, firstName, channelId) {
  await DB.prepare('INSERT OR IGNORE INTO join_request_log (user_id,username,first_name,channel_id) VALUES (?,?,?,?)').bind(userId, username||null, firstName||null, channelId).run();
}
export async function markJoinApproved(DB, userId, channelId) {
  await DB.prepare('UPDATE join_request_log SET approved=1 WHERE user_id=? AND channel_id=?').bind(userId, channelId).run();
}
export async function getPendingJoin(DB, userId) {
  return await DB.prepare('SELECT * FROM join_request_log WHERE user_id=? AND approved=0 ORDER BY requested_at DESC LIMIT 1').bind(userId).first();
}

// AI Settings
export async function getAISettings(DB) {
  const {results} = await DB.prepare('SELECT key,value FROM ai_settings').all();
  const out = {};
  for (const r of results) out[r.key] = r.value;
  return out;
}
export async function setAISetting(DB, key, value) {
  await DB.prepare('INSERT OR REPLACE INTO ai_settings (key,value) VALUES (?,?)').bind(key, value).run();
}
