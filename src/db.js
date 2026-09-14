// ─── Database Layer ───────────────────────────────────────────────────────────
export async function getSetting(DB,key){const r=await DB.prepare('SELECT value FROM bot_settings WHERE key=?').bind(key).first();return r?r.value:null;}
export async function setSetting(DB,key,value){await DB.prepare('INSERT OR REPLACE INTO bot_settings(key,value)VALUES(?,?)').bind(key,value).run();}
export async function saveUser(DB,user){await DB.prepare(`INSERT INTO users(user_id,username,first_name,last_name,last_seen)VALUES(?,?,?,?,datetime('now'))ON CONFLICT(user_id)DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,last_seen=excluded.last_seen`).bind(user.id,user.username||null,user.first_name||null,user.last_name||null).run();}
export async function getAllUserIds(DB){const{results}=await DB.prepare('SELECT user_id FROM users').all();return results.map(r=>r.user_id);}
export async function getUserCount(DB){const r=await DB.prepare('SELECT COUNT(*) as c FROM users').first();return r.c;}
export async function getUser(DB,userId){return await DB.prepare('SELECT * FROM users WHERE user_id=?').bind(userId).first();}
export async function isAdmin(DB,userId){const r=await DB.prepare('SELECT user_id FROM admins WHERE user_id=?').bind(userId).first();return!!r;}
export async function isSuperAdmin(DB,userId){const r=await DB.prepare('SELECT user_id FROM admins WHERE user_id=? AND is_super=1').bind(userId).first();return!!r;}
export async function addAdmin(DB,userId,username,isSuper=0){await DB.prepare('INSERT OR IGNORE INTO admins(user_id,username,is_super)VALUES(?,?,?)').bind(userId,username||null,isSuper).run();}
export async function removeAdmin(DB,userId){await DB.prepare('DELETE FROM admins WHERE user_id=? AND is_super=0').bind(userId).run();}
export async function getAllAdmins(DB){const{results}=await DB.prepare('SELECT user_id,username,is_super FROM admins').all();return results;}
export async function getSession(DB,userId){const r=await DB.prepare('SELECT data FROM sessions WHERE user_id=?').bind(userId).first();if(!r)return null;try{return JSON.parse(r.data);}catch{return null;}}
export async function setSession(DB,userId,data){await DB.prepare(`INSERT INTO sessions(user_id,data,updated_at)VALUES(?,?,datetime('now'))ON CONFLICT(user_id)DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`).bind(userId,JSON.stringify(data)).run();}
export async function clearSession(DB,userId){await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();}
export async function genNodeId(){return 'n'+Math.random().toString(36).slice(2,9);}
export async function getNodes(DB){const{results}=await DB.prepare('SELECT * FROM menu_nodes ORDER BY sort_order ASC').all();const nodes={};for(const n of results){nodes[n.id]={...n,children:[],files:[]};}for(const n of results){if(n.parent_id&&nodes[n.parent_id])nodes[n.parent_id].children.push(n.id);}const{results:files}=await DB.prepare('SELECT * FROM menu_files ORDER BY sort_order ASC').all();for(const f of files){if(nodes[f.node_id])nodes[f.node_id].files.push(f);}return nodes;}
export async function saveNode(DB,node){await DB.prepare(`INSERT INTO menu_nodes(id,parent_id,title,type,content,url,form_key,enabled,sort_order,columns,access_mode)VALUES(?,?,?,?,?,?,?,?,?,?,?)ON CONFLICT(id)DO UPDATE SET parent_id=excluded.parent_id,title=excluded.title,type=excluded.type,content=excluded.content,url=excluded.url,form_key=excluded.form_key,enabled=excluded.enabled,sort_order=excluded.sort_order,columns=excluded.columns,access_mode=excluded.access_mode`).bind(node.id,node.parent_id||null,node.title,node.type||'text',node.content||null,node.url||null,node.form_key||null,node.enabled!==false?1:0,node.sort_order||0,node.columns||2,node.access_mode||'everyone').run();}
export async function deleteNode(DB,id){const nodes=await getNodes(DB);async function del(nid){const n=nodes[nid];if(!n)return;for(const cid of(n.children||[]))await del(cid);await DB.prepare('DELETE FROM menu_files WHERE node_id=?').bind(nid).run();await DB.prepare('DELETE FROM menu_nodes WHERE id=?').bind(nid).run();}await del(id);}
export async function getForms(DB){const{results}=await DB.prepare('SELECT * FROM forms').all();const out={};for(const f of results){out[f.id]={...f,steps:JSON.parse(f.steps||'[]')};}return out;}
export async function getForm(DB,id){const r=await DB.prepare('SELECT * FROM forms WHERE id=?').bind(id).first();if(!r)return null;return{...r,steps:JSON.parse(r.steps||'[]')};}
export async function saveFormResponse(DB,formId,userId,username,firstName,data){await DB.prepare('INSERT INTO form_responses(form_id,user_id,username,first_name,data)VALUES(?,?,?,?,?)').bind(formId,userId,username||null,firstName||null,JSON.stringify(data)).run();}
export async function saveAnonQuestion(DB,userId,refMsgId,question){await DB.prepare('INSERT INTO anon_questions(user_id,ref_message_id,question)VALUES(?,?,?)').bind(userId,String(refMsgId),question).run();}
export async function getAnonQuestion(DB,refMsgId){return await DB.prepare('SELECT * FROM anon_questions WHERE ref_message_id=?').bind(String(refMsgId)).first();}
export async function getGateChannels(DB){const{results}=await DB.prepare('SELECT * FROM gate_channels').all();return results;}
export async function addGateChannel(DB,channelId,title,link){await DB.prepare('INSERT OR IGNORE INTO gate_channels(channel_id,channel_title,invite_link)VALUES(?,?,?)').bind(channelId,title,link).run();}
export async function removeGateChannel(DB,id){await DB.prepare('DELETE FROM gate_channels WHERE id=?').bind(id).run();}
export async function getAdGroups(DB){const{results}=await DB.prepare('SELECT * FROM ad_groups WHERE is_active=1').all();return results;}
export async function addAdGroup(DB,groupId,title){await DB.prepare('INSERT OR REPLACE INTO ad_groups(group_id,group_title,is_active)VALUES(?,?,1)').bind(groupId,title).run();}
export async function removeAdGroup(DB,id){await DB.prepare('DELETE FROM ad_groups WHERE id=?').bind(id).run();}
export async function isAdGroup(DB,groupId){const r=await DB.prepare('SELECT id FROM ad_groups WHERE group_id=? AND is_active=1').bind(groupId).first();return!!r;}
export async function wasAdSentRecently(DB,userId,hours){const r=await DB.prepare(`SELECT id FROM ad_sent_log WHERE user_id=? AND datetime(sent_at)>datetime('now',?||' hours')LIMIT 1`).bind(userId,`-${hours}`).first();return!!r;}
export async function logAdSent(DB,userId,groupId){await DB.prepare('INSERT INTO ad_sent_log(user_id,group_id)VALUES(?,?)').bind(userId,groupId).run();}
export async function getAdStats(DB){const total=await DB.prepare('SELECT COUNT(*) as c FROM ad_sent_log').first();const today=await DB.prepare("SELECT COUNT(*) as c FROM ad_sent_log WHERE DATE(sent_at)=DATE('now')").first();const joins=await DB.prepare('SELECT COUNT(*) as c FROM join_request_log WHERE approved=1').first();return{adSent:total.c,adToday:today.c,joinApproved:joins.c};}
export async function logJoinRequest(DB,userId,username,firstName,channelId){await DB.prepare('INSERT OR IGNORE INTO join_request_log(user_id,username,first_name,channel_id)VALUES(?,?,?,?)').bind(userId,username||null,firstName||null,channelId).run();}
export async function markJoinApproved(DB,userId,channelId){await DB.prepare('UPDATE join_request_log SET approved=1 WHERE user_id=? AND channel_id=?').bind(userId,channelId).run();}
export async function getPendingJoin(DB,userId){return await DB.prepare('SELECT * FROM join_request_log WHERE user_id=? AND approved=0 ORDER BY requested_at DESC LIMIT 1').bind(userId).first();}
export async function getAISettings(DB){const{results}=await DB.prepare('SELECT key,value FROM ai_settings').all();const out={};for(const r of results)out[r.key]=r.value;return out;}
export async function setAISetting(DB,key,value){await DB.prepare('INSERT OR REPLACE INTO ai_settings(key,value)VALUES(?,?)').bind(key,value).run();}
export async function getVideoFields(DB){const{results}=await DB.prepare('SELECT * FROM video_fields ORDER BY sort_order ASC').all();return results;}
export async function getVideoField(DB,id){return await DB.prepare('SELECT * FROM video_fields WHERE id=?').bind(id).first();}
export async function saveVideoField(DB,id,title,sortOrder=0){await DB.prepare('INSERT OR REPLACE INTO video_fields(id,title,sort_order)VALUES(?,?,?)').bind(id,title,sortOrder).run();}
export async function deleteVideoField(DB,id){await DB.prepare('DELETE FROM video_lessons WHERE grade_id IN(SELECT id FROM video_grades WHERE field_id=?)').bind(id).run();await DB.prepare('DELETE FROM video_grades WHERE field_id=?').bind(id).run();await DB.prepare('DELETE FROM video_fields WHERE id=?').bind(id).run();}
export async function getVideoGrades(DB,fieldId){const{results}=await DB.prepare('SELECT * FROM video_grades WHERE field_id=? ORDER BY sort_order ASC').bind(fieldId).all();return results;}
export async function getVideoGrade(DB,id){return await DB.prepare('SELECT * FROM video_grades WHERE id=?').bind(id).first();}
export async function saveVideoGrade(DB,id,fieldId,title,sortOrder=0){await DB.prepare('INSERT OR REPLACE INTO video_grades(id,field_id,title,sort_order)VALUES(?,?,?,?)').bind(id,fieldId,title,sortOrder).run();}
export async function deleteVideoGrade(DB,id){await DB.prepare('DELETE FROM video_lessons WHERE grade_id=?').bind(id).run();await DB.prepare('DELETE FROM video_grades WHERE id=?').bind(id).run();}
export async function getVideoLessons(DB,gradeId){const{results}=await DB.prepare('SELECT * FROM video_lessons WHERE grade_id=? ORDER BY sort_order ASC').bind(gradeId).all();return results;}
export async function getVideoLesson(DB,id){return await DB.prepare('SELECT * FROM video_lessons WHERE id=?').bind(id).first();}
export async function saveVideoLesson(DB,id,gradeId,title,messageId,sortOrder=0){await DB.prepare('INSERT OR REPLACE INTO video_lessons(id,grade_id,title,message_id,sort_order)VALUES(?,?,?,?,?)').bind(id,gradeId,title,messageId,sortOrder).run();}
export async function deleteVideoLesson(DB,id){await DB.prepare('DELETE FROM video_lessons WHERE id=?').bind(id).run();}
export async function saveSupportMsg(DB,userId,adminId,adminMsgId,text){await DB.prepare('INSERT INTO support_messages(user_id,admin_id,admin_msg_id,text)VALUES(?,?,?,?)').bind(userId,adminId,String(adminMsgId),text).run();}
export async function getSupportMsg(DB,adminMsgId){return await DB.prepare('SELECT * FROM support_messages WHERE admin_msg_id=?').bind(String(adminMsgId)).first();}
export async function getUserPoints(DB,userId){const r=await DB.prepare('SELECT COALESCE(SUM(amount),0) as total FROM points_log WHERE user_id=?').bind(userId).first();return r?.total||0;}
export async function addUserPoints(DB,userId,amount,reason){await DB.prepare('INSERT INTO points_log(user_id,amount,reason)VALUES(?,?,?)').bind(userId,amount,reason).run();}
export async function getUserRank(DB,userId){const r=await DB.prepare(`SELECT COUNT(*)+1 as rank FROM(SELECT user_id,SUM(amount) as total FROM points_log GROUP BY user_id)WHERE total>COALESCE((SELECT SUM(amount)FROM points_log WHERE user_id=?),0)`).bind(userId).first();return r?.rank||1;}
export async function getTopUsers(DB,limit=10){const{results}=await DB.prepare(`SELECT p.user_id,COALESCE(u.first_name,'') as first_name,SUM(p.amount) as points FROM points_log p LEFT JOIN users u ON p.user_id=u.user_id GROUP BY p.user_id ORDER BY points DESC LIMIT ?`).bind(limit).all();return results;}
export async function getRef(DB,userId){return await DB.prepare('SELECT * FROM referrals WHERE user_id=?').bind(userId).first();}
export async function saveRef(DB,userId,refUserId){await DB.prepare('INSERT OR IGNORE INTO referrals(user_id,ref_user_id)VALUES(?,?)').bind(userId,refUserId).run();}
export async function getRefCount(DB,userId){const r=await DB.prepare('SELECT COUNT(*) as c FROM referrals WHERE ref_user_id=?').bind(userId).first();return r?.c||0;}
export async function getUserTags(DB,userId){const{results}=await DB.prepare('SELECT tag FROM user_tags WHERE user_id=?').bind(userId).all();return results.map(r=>r.tag);}
export async function addUserTag(DB,userId,tag){await DB.prepare('INSERT OR IGNORE INTO user_tags(user_id,tag)VALUES(?,?)').bind(userId,tag).run();}
export async function removeUserTag(DB,userId,tag){await DB.prepare('DELETE FROM user_tags WHERE user_id=? AND tag=?').bind(userId,tag).run();}
export async function getUsersByTag(DB,tag){const{results}=await DB.prepare('SELECT DISTINCT user_id FROM user_tags WHERE tag=?').bind(tag).all();return results;}
export async function getAllTags(DB){const{results}=await DB.prepare('SELECT DISTINCT tag FROM user_tags ORDER BY tag').all();return results.map(r=>r.tag);}
export async function getPoll(DB,pollId){return await DB.prepare('SELECT * FROM polls WHERE id=?').bind(pollId).first();}
export async function getActivePolls(DB){const{results}=await DB.prepare('SELECT * FROM polls WHERE is_active=1').all();return results;}
export async function savePoll(DB,id,question,options){await DB.prepare('INSERT OR REPLACE INTO polls(id,question,options,is_active)VALUES(?,?,?,1)').bind(id,question,JSON.stringify(options)).run();}
export async function hasVoted(DB,userId,pollId){const r=await DB.prepare('SELECT id FROM poll_votes WHERE user_id=? AND poll_id=?').bind(userId,pollId).first();return!!r;}
export async function saveVote(DB,userId,pollId,optionIndex){await DB.prepare('INSERT OR IGNORE INTO poll_votes(user_id,poll_id,option_index)VALUES(?,?,?)').bind(userId,pollId,optionIndex).run();}
export async function getPollResults(DB,pollId){const{results}=await DB.prepare('SELECT option_index,COUNT(*) as count FROM poll_votes WHERE poll_id=? GROUP BY option_index').bind(pollId).all();return results;}
export async function saveScheduledMessage(DB,text,sendAt,tag){await DB.prepare('INSERT INTO scheduled_messages(text,send_at,tag)VALUES(?,?,?)').bind(text,sendAt,tag||null).run();}
export async function getPendingScheduled(DB){const{results}=await DB.prepare("SELECT * FROM scheduled_messages WHERE sent=0 AND send_at<=datetime('now')").all();return results;}
export async function markScheduledSent(DB,id){await DB.prepare('UPDATE scheduled_messages SET sent=1 WHERE id=?').bind(id).run();}
export async function getScheduledMessages(DB){const{results}=await DB.prepare('SELECT * FROM scheduled_messages ORDER BY send_at DESC LIMIT 20').all();return results;}
