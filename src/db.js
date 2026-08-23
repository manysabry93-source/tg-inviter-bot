// ─── Database Helpers ─────────────────────────────────────────────────────────

export async function isAdmin(DB, userId) {
  const row = await DB.prepare('SELECT user_id FROM admins WHERE user_id = ?').bind(userId).first();
  return !!row;
}

export async function isSuperAdmin(DB, userId) {
  const row = await DB.prepare('SELECT user_id FROM admins WHERE user_id = ? AND is_super = 1').bind(userId).first();
  return !!row;
}

export async function addAdmin(DB, userId, username, isSuper = 0) {
  await DB.prepare('INSERT OR IGNORE INTO admins (user_id, username, is_super) VALUES (?, ?, ?)')
    .bind(userId, username || null, isSuper).run();
}

export async function removeAdmin(DB, userId) {
  await DB.prepare('DELETE FROM admins WHERE user_id = ? AND is_super = 0').bind(userId).run();
}

export async function getAllAdmins(DB) {
  const { results } = await DB.prepare('SELECT user_id, username, is_super, added_at FROM admins').all();
  return results;
}

export async function getSetting(DB, key) {
  const row = await DB.prepare('SELECT value FROM bot_settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(DB, key, value) {
  await DB.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').bind(key, value).run();
}

export async function addSourceChannel(DB, channelId, title, link) {
  await DB.prepare('INSERT OR REPLACE INTO source_channels (channel_id, channel_title, channel_link) VALUES (?, ?, ?)')
    .bind(channelId, title, link).run();
}

export async function removeSourceChannel(DB, channelId) {
  await DB.prepare('DELETE FROM source_channels WHERE channel_id = ?').bind(channelId).run();
}

export async function getSourceChannels(DB) {
  const { results } = await DB.prepare('SELECT channel_id, channel_title, channel_link, is_active FROM source_channels').all();
  return results;
}

export async function addTargetChannel(DB, channelId, title, link) {
  await DB.prepare('INSERT OR REPLACE INTO target_channels (channel_id, channel_title, channel_link) VALUES (?, ?, ?)')
    .bind(channelId, title, link).run();
}

export async function removeTargetChannel(DB, channelId) {
  await DB.prepare('DELETE FROM target_channels WHERE channel_id = ?').bind(channelId).run();
}

export async function getTargetChannels(DB) {
  const { results } = await DB.prepare('SELECT channel_id, channel_title, channel_link, is_active FROM target_channels').all();
  return results;
}

export async function logMember(DB, userId, username, firstName, lastName, srcId, tgtId) {
  await DB.prepare(`INSERT INTO converted_members
    (user_id, username, first_name, last_name, source_channel_id, target_channel_id, message_sent)
    VALUES (?, ?, ?, ?, ?, ?, 1)`)
    .bind(userId, username || null, firstName || null, lastName || null, srcId, tgtId).run();
}

export async function getStats(DB) {
  const total     = await DB.prepare('SELECT COUNT(*) as c FROM converted_members').first();
  const today     = await DB.prepare("SELECT COUNT(*) as c FROM converted_members WHERE DATE(converted_at) = DATE('now')").first();
  const sent      = await DB.prepare('SELECT COUNT(*) as c FROM converted_members WHERE message_sent = 1').first();
  const sources   = await DB.prepare('SELECT COUNT(*) as c FROM source_channels').first();
  const targets   = await DB.prepare('SELECT COUNT(*) as c FROM target_channels').first();
  const admins    = await DB.prepare('SELECT COUNT(*) as c FROM admins').first();
  return {
    total: total.c, today: today.c, sent: sent.c,
    sources: sources.c, targets: targets.c, admins: admins.c,
  };
}

export async function getMembers(DB, limit = 10, offset = 0) {
  const { results } = await DB.prepare(`
    SELECT user_id, username, first_name, last_name,
           source_channel_id, target_channel_id, message_sent, converted_at
    FROM converted_members ORDER BY converted_at DESC LIMIT ? OFFSET ?
  `).bind(limit, offset).all();
  return results;
}

export async function getActiveInviteMessage(DB) {
  const row = await DB.prepare('SELECT message_text FROM invite_messages WHERE is_active = 1 ORDER BY id DESC LIMIT 1').first();
  return row ? row.message_text : null;
}

export async function setInviteMessage(DB, text) {
  await DB.prepare('UPDATE invite_messages SET is_active = 0').run();
  await DB.prepare('INSERT INTO invite_messages (message_text, is_active) VALUES (?, 1)').bind(text).run();
}

export async function getMembersCountBySource(DB, sourceId) {
  const row = await DB.prepare('SELECT COUNT(*) as c FROM converted_members WHERE source_channel_id = ?').bind(sourceId).first();
  return row ? row.c : 0;
}

export async function alreadyInvited(DB, userId, targetId) {
  const row = await DB.prepare(
    'SELECT id FROM converted_members WHERE user_id = ? AND target_channel_id = ?'
  ).bind(userId, targetId).first();
  return !!row;
}

// ─── Ad Listener ──────────────────────────────────────────────────────────────

export async function addAdGroup(DB, groupId, title, link) {
  await DB.prepare('INSERT OR REPLACE INTO ad_groups (group_id, group_title, group_link) VALUES (?,?,?)')
    .bind(groupId, title, link).run();
}

export async function removeAdGroup(DB, groupId) {
  await DB.prepare('DELETE FROM ad_groups WHERE group_id = ?').bind(groupId).run();
}

export async function getAdGroups(DB) {
  const { results } = await DB.prepare('SELECT * FROM ad_groups').all();
  return results;
}

export async function isAdGroup(DB, groupId) {
  const row = await DB.prepare('SELECT id FROM ad_groups WHERE group_id = ? AND is_active = 1').bind(groupId).first();
  return !!row;
}

export async function getActiveAdMessage(DB) {
  const row = await DB.prepare('SELECT message_text FROM ad_messages WHERE is_active = 1 ORDER BY id DESC LIMIT 1').first();
  return row ? row.message_text : null;
}

export async function setAdMessage(DB, text) {
  await DB.prepare('UPDATE ad_messages SET is_active = 0').run();
  await DB.prepare('INSERT INTO ad_messages (message_text, is_active) VALUES (?,1)').bind(text).run();
}

export async function wasAdSentRecently(DB, userId, cooldownHours) {
  const row = await DB.prepare(`
    SELECT id FROM ad_sent_log
    WHERE user_id = ?
    AND datetime(sent_at) > datetime('now', ? || ' hours')
    LIMIT 1
  `).bind(userId, `-${cooldownHours}`).first();
  return !!row;
}

export async function logAdSent(DB, userId, groupId) {
  await DB.prepare('INSERT INTO ad_sent_log (user_id, group_id) VALUES (?,?)').bind(userId, groupId).run();
}

export async function getAdStats(DB) {
  const total = await DB.prepare('SELECT COUNT(*) as c FROM ad_sent_log').first();
  const today = await DB.prepare("SELECT COUNT(*) as c FROM ad_sent_log WHERE DATE(sent_at) = DATE('now')").first();
  const groups = await DB.prepare('SELECT COUNT(*) as c FROM ad_groups WHERE is_active = 1').first();
  const unique = await DB.prepare('SELECT COUNT(DISTINCT user_id) as c FROM ad_sent_log').first();
  return { total: total.c, today: today.c, groups: groups.c, unique: unique.c };
}
