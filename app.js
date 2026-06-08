// ── 常數 ──
const ADMIN_ID = 'admin';
const ADMIN_PW = 'admin1234';

const CATEGORIES = ['3C產品','證件','文具','水壺','衣物','鑰匙','錢包','書籍','其他'];
function categoryIcon(cat) {
  const map = {
    '3C產品': '💻',
    '證件': '🪪',
    '文具': '✏️',
    '水壺': '🥤',
    '衣物': '👕',
    '鑰匙': '🔑',
    '錢包': '👛',
    '書籍': '📚',
    '其他': '📦'
  };
  return map[cat] || '📦';
}
const STATUS = { PENDING: '待認領', REVIEWING: '審核中', CLOSED: '已結案' };

// ── Supabase 初始化 ──
const SUPABASE_URL = 'https://xllfnmoursxeggjgmizt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XxWtDTa2LsNfqYhpHiYeAA_GHNBn1tL';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 用戶 ──
async function registerUser(studentId, password, name) {
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: studentId + '@zhaozhao.com',
      password: password,
      options: {
        data: {
          student_id: studentId,
          name: name
        }
      }
    });
    if (error) return { ok: false, msg: error.message };
    
    // Also write to profiles table
    if (data && data.user) {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert({
          id: data.user.id,
          student_id: studentId,
          name: name
        });
      if (profileError) console.error("Error creating profile:", profileError);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

async function loginUser(studentId, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: studentId + '@zhaozhao.com',
      password: password
    });
    if (error) return { ok: false, msg: error.message };
    
    const isAdmin = studentId === ADMIN_ID;
    return { ok: true, isAdmin: isAdmin };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

async function logoutUser() {
  await supabaseClient.auth.signOut();
}

function getSession() {
  // Synchronously fetch Supabase session from localStorage to avoid page rendering flickering
  const raw = localStorage.getItem('sb-xllfnmoursxeggjgmizt-auth-token');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !data.user) return null;
    const meta = data.user.user_metadata;
    const studentId = meta?.student_id || data.user.email.split('@')[0];
    const name = meta?.name || '使用者';
    const isAdmin = studentId === ADMIN_ID;
    const avatarUrl = localStorage.getItem(`zhaozhao-avatar-${studentId}`) || null;
    return { id: studentId, name: name, isAdmin: isAdmin, uuid: data.user.id, avatarUrl };
  } catch (e) {
    return null;
  }
}

async function getProfile(studentId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.student_id,
    name: data.name,
    avatarUrl: data.avatar_url || null,
    nameChangeLog: data.name_change_log ? JSON.parse(data.name_change_log) : [],
    createdAt: data.created_at,
  };
}

async function updateProfile(studentId, updates) {
  const { error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('student_id', studentId);
  return !error;
}

function isLoggedIn() { return !!getSession(); }
function isAdmin() { const s = getSession(); return s?.isAdmin === true; }

async function getUsers() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*');
  if (error) {
    console.error("Error fetching users:", error);
    return [];
  }
  return data.map(u => ({
    id: u.student_id,
    name: u.name,
    createdAt: new Date(u.created_at).getTime()
  }));
}

async function deleteUser(studentId) {
  const { error } = await supabaseClient
    .from('profiles')
    .delete()
    .eq('student_id', studentId);
  if (error) {
    console.error("Error deleting user profile:", error);
    return false;
  }
  return true;
}

async function deleteConversation(key) {
  const { error: msgError } = await supabaseClient
    .from('messages')
    .delete()
    .eq('conversation_key', key);
  if (msgError) {
    console.error("Error deleting messages for conversation:", msgError);
    return false;
  }
  
  const { error: convError } = await supabaseClient
    .from('conversations')
    .delete()
    .eq('key', key);
  if (convError) {
    console.error("Error deleting conversation:", convError);
    return false;
  }
  return true;
}

// ── 貼文 ──
function mapPost(p) {
  if (!p) return null;
  let images = [];
  if (p.image_url) {
    if (p.image_url.startsWith('[') && p.image_url.endsWith(']')) {
      try {
        images = JSON.parse(p.image_url);
      } catch (e) {
        images = [p.image_url];
      }
    } else {
      images = [p.image_url];
    }
  }
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    category: p.category,
    location: p.location,
    description: p.description,
    imageUrl: images,
    authorId: p.author_id,
    authorName: p.author_name,
    status: p.status,
    createdAt: p.created_at
  };
}

async function getPosts() {
  const { data, error } = await supabaseClient
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
  return data.map(mapPost);
}

async function getPost(id) {
  const { data, error } = await supabaseClient
    .from('posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error("Error fetching post:", error);
    return null;
  }
  return mapPost(data);
}

async function addPost(post) {
  const newId = 'p' + Date.now();
  const session = getSession();
  const newPost = {
    id: newId,
    type: post.type,
    title: post.title,
    category: post.category,
    location: post.location,
    description: post.description,
    image_url: Array.isArray(post.imageUrl) ? JSON.stringify(post.imageUrl) : (post.imageUrl || ''),
    author_id: session ? session.id : 'anonymous',
    author_name: session ? session.name : '匿名',
    status: STATUS.PENDING,
    created_at: Date.now()
  };
  const { error } = await supabaseClient
    .from('posts')
    .insert(newPost);
  if (error) {
    console.error("Error adding post:", error);
    throw error;
  }
  return newId;
}

async function updatePostStatus(id, status) {
  const { error } = await supabaseClient
    .from('posts')
    .update({ status: status })
    .eq('id', id);
  if (error) {
    console.error("Error updating post status:", error);
    return false;
  }
  return true;
}

async function deletePost(id) {
  const { error } = await supabaseClient
    .from('posts')
    .delete()
    .eq('id', id);
  if (error) {
    console.error("Error deleting post:", error);
  }
}

// ── 認領申請 ──
async function getClaims() {
  const { data, error } = await supabaseClient
    .from('claims')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error("Error fetching claims:", error);
    return [];
  }
  return data.map(c => ({
    id: c.id,
    postId: c.post_id,
    studentId: c.student_id,
    claimantId: c.student_id,
    name: c.name,
    claimantName: c.name,
    contact: c.contact,
    proof: c.proof,
    detail: c.proof,
    status: c.status,
    createdAt: c.created_at
  }));
}

async function addClaim(postId, claim) {
  const newId = 'c' + Date.now();
  const newClaim = {
    id: newId,
    post_id: postId,
    student_id: claim.studentId,
    name: claim.claimantName || claim.name || '匿名',
    contact: claim.contact,
    proof: claim.detail,
    status: 'pending',
    created_at: Date.now()
  };
  
  const { error } = await supabaseClient
    .from('claims')
    .insert(newClaim);
  if (error) {
    console.error("Error adding claim:", error);
    throw error;
  }
  
  await updatePostStatus(postId, STATUS.REVIEWING);
  return newId;
}

async function getClaimsByPost(postId) {
  const { data, error } = await supabaseClient
    .from('claims')
    .select('*')
    .eq('post_id', postId);
  if (error) {
    console.error("Error fetching claims by post:", error);
    return [];
  }
  return data.map(c => ({
    id: c.id,
    postId: c.post_id,
    studentId: c.student_id,
    claimantId: c.student_id,
    name: c.name,
    claimantName: c.name,
    contact: c.contact,
    proof: c.proof,
    detail: c.proof,
    status: c.status,
    createdAt: c.created_at
  }));
}

async function updateClaim(id, status) {
  const { data, error } = await supabaseClient
    .from('claims')
    .update({ status: status })
    .eq('id', id)
    .select('post_id')
    .single();
  if (error) {
    console.error("Error updating claim:", error);
    return false;
  }
  
  if (status === 'approved' && data) {
    await updatePostStatus(data.post_id, STATUS.CLOSED);
  }
  return true;
}

// ── 私訊 ──
function getChatKey(postId, userA, userB) {
  const participants = [userA, userB].sort();
  return `lf_chat_${postId}_${participants[0]}_${participants[1]}`;
}

async function ensureConversation(postId, userA, nameA, userB, nameB) {
  const key = getChatKey(postId, userA, userB);
  
  const { data: existing, error: fetchError } = await supabaseClient
    .from('conversations')
    .select('*')
    .eq('key', key)
    .maybeSingle();
    
  if (existing) {
    return {
      key: existing.key,
      postId: existing.post_id,
      postTitle: existing.post_title,
      lastTime: existing.last_time,
      participants: [
        { id: existing.user_a_id, name: existing.user_a_name },
        { id: existing.user_b_id, name: existing.user_b_name }
      ]
    };
  }
  
  let postTitle = '（已刪除貼文）';
  if (postId === 'support') {
    postTitle = '客服對話';
  } else {
    const post = await getPost(postId);
    if (post) postTitle = post.title;
  }
  
  const newConv = {
    key: key,
    post_id: postId,
    post_title: postTitle,
    user_a_id: userA,
    user_a_name: nameA,
    user_b_id: userB,
    user_b_name: nameB,
    last_time: Date.now()
  };
  
  const { error: insertError } = await supabaseClient
    .from('conversations')
    .insert(newConv);
    
  if (insertError) {
    console.error("Error ensuring conversation:", insertError);
  }
  return {
    key: newConv.key,
    postId: newConv.post_id,
    postTitle: newConv.post_title,
    lastTime: newConv.last_time,
    participants: [
      { id: newConv.user_a_id, name: newConv.user_a_name },
      { id: newConv.user_b_id, name: newConv.user_b_name }
    ]
  };
}

async function getMessages(postId, userA, userB) {
  const key = getChatKey(postId, userA, userB);
  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('conversation_key', key)
    .order('created_at', { ascending: true });
  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }
  return data.map(m => ({
    senderId: m.sender_id,
    senderName: m.sender_name,
    text: m.text,
    time: m.created_at
  }));
}

async function sendMessage(postId, senderId, senderName, receiverId, receiverName, text) {
  const key = getChatKey(postId, senderId, receiverId);
  await ensureConversation(postId, senderId, senderName, receiverId, receiverName);
  
  const newMsg = {
    id: 'm' + Date.now(),
    conversation_key: key,
    sender_id: senderId,
    sender_name: senderName,
    text: text,
    created_at: Date.now()
  };
  
  const { error: msgError } = await supabaseClient
    .from('messages')
    .insert(newMsg);
  if (msgError) {
    console.error("Error sending message:", msgError);
    return false;
  }
  
  const { error: convError } = await supabaseClient
    .from('conversations')
    .update({ last_time: Date.now() })
    .eq('key', key);
  if (convError) {
    console.error("Error updating conversation last_time:", convError);
  }
  return true;
}

async function getMyConversations(userId) {
  const { data, error } = await supabaseClient
    .from('conversations')
    .select('*')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('last_time', { ascending: false });
  if (error) {
    console.error("Error fetching conversations:", error);
    return [];
  }
  
  return data.map(c => ({
    key: c.key,
    postId: c.post_id,
    postTitle: c.post_title,
    lastTime: c.last_time,
    participants: [
      { id: c.user_a_id, name: c.user_a_name },
      { id: c.user_b_id, name: c.user_b_name }
    ]
  }));
}

// ── UI 工具 ──
function statusBadge(status) {
  const map = {
    [STATUS.PENDING]: 'badge-pending',
    [STATUS.REVIEWING]: 'badge-reviewing',
    [STATUS.CLOSED]: 'badge-closed',
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}

function typeBadge(type) {
  return type === 'found'
    ? '<span class="badge badge-found">拾獲招領</span>'
    : '<span class="badge badge-lost">遺失協尋</span>';
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

// ── Navbar 渲染 ──
function renderNavbar(activePage) {
  const session = getSession();
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const links = `
    <a href="index.html" ${activePage === 'home' ? 'style="color:var(--primary);font-weight:500"' : ''}>首頁</a>
    <a href="list.html" ${activePage === 'list' ? 'style="color:var(--primary);font-weight:500"' : ''}>失物列表</a>
  `;

  let rightSection = '';
  if (session) {
    const initial = session.name.charAt(0).toUpperCase();
    rightSection = `
      <div class="navbar-user">
        ${session.isAdmin ? '<a href="admin.html" style="color:var(--amber-dark);font-weight:700">後台</a>' : ''}
        <a href="add.html" class="btn btn-primary btn-sm">+ 新增</a>
        <a href="profile.html" title="個人中心" class="nav-profile" style="display:flex;align-items:center;gap:0.5rem;padding:0;">
          ${session.avatarUrl
            ? `<img src="${session.avatarUrl}" alt="${initial}" class="avatar" style="object-fit:cover;cursor:pointer;" onclick="event.preventDefault();showAvatarModal('${session.avatarUrl}','${initial}')">`
            : `<div class="avatar" style="cursor:pointer;" onclick="event.preventDefault();showAvatarModal(null,'${initial}')">${initial}</div>`
          }
          <span class="nav-profile-text">個人中心</span>
        </a>
        ${session.isAdmin
          ? `<a href="admin.html" class="nav-support">客服管理</a>`
          : `<a href="#" class="nav-support" onclick="openGlobalChat('admin', '管理員', 'support', '聯絡客服'); return false;">客服</a>`
        }
        <button onclick="handleLogout()" style="color:var(--danger);font-weight:500;">登出</button>
      </div>
    `;
  } else {
    rightSection = `
      <a href="login.html">登入</a>
      <a href="register.html" class="btn btn-primary btn-sm">註冊</a>
    `;
  }

  const mobileAvatar = session ? `
    <a href="profile.html" class="mobile-avatar" title="個人中心" style="margin-right: 0.5rem;">
      ${session.avatarUrl
        ? `<img src="${session.avatarUrl}" alt="${session.name.charAt(0).toUpperCase()}" class="avatar" style="width:32px;height:32px;object-fit:cover;">`
        : `<div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${session.name.charAt(0).toUpperCase()}</div>`
      }
    </a>
  ` : '';

  navbar.innerHTML = `
    <a class="navbar-brand" href="index.html">
      <img src="logo-icon.png" alt="找找" class="navbar-logo">
      <img src="logo-text.png" alt="找找" class="navbar-brand-text-logo">
    </a>
    <div style="display: flex; align-items: center;">
      ${mobileAvatar}
      <button class="navbar-toggle" id="navbar-toggle" aria-label="選單" onclick="toggleNavMenu()">☰</button>
    </div>
    <div class="navbar-links" id="navbar-links">
      ${links}
      ${rightSection}
    </div>
  `;

  if (session && !session.isAdmin) initChatWidget();
}

function toggleNavMenu() {
  const links = document.getElementById('navbar-links');
  if (links) links.classList.toggle('open');
}

// 點選單外部自動收合
document.addEventListener('click', function(e) {
  const navbar = document.getElementById('navbar');
  const links = document.getElementById('navbar-links');
  if (!navbar || !links || !links.classList.contains('open')) return;
  if (!navbar.contains(e.target)) links.classList.remove('open');
});

async function handleLogout() {
  if (!confirm('確定要登出嗎？')) return;
  await logoutUser();
  window.location.href = 'index.html';
}

// ── Avatar Modal ──
function showAvatarModal(imgSrc, initial) {
  let modal = document.getElementById('avatar-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'avatar-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    modal.onclick = () => modal.style.display = 'none';
    document.body.appendChild(modal);
  }
  modal.innerHTML = imgSrc
    ? `<img src="${imgSrc}" style="max-width:80vw;max-height:80vh;border-radius:50%;object-fit:cover;width:280px;height:280px;box-shadow:0 8px 32px rgba(0,0,0,0.4);">`
    : `<div style="width:200px;height:200px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:5rem;font-weight:800;font-family:var(--font-display);box-shadow:0 8px 32px rgba(0,0,0,0.4);">${initial}</div>`;
  modal.style.display = 'flex';
}

// ── Floating Chat Widget ──
let cwpCurrentPartner = null;
let cwpCurrentPostId = null;
let cwpMsgInterval = null;

function initChatWidget() {
  if (document.getElementById('chat-widget')) return;
  const widget = document.createElement('div');
  widget.id = 'chat-widget';
  widget.innerHTML = `
    <div id="chat-widget-panel" style="display:none;">
      <div id="cwp-list">
        <div class="cwp-header">
          <span class="cwp-title">💬 我的私訊</span>
          <button onclick="toggleChatWidget()">✕</button>
        </div>
        <div id="cwp-conversations" style="max-height:360px; overflow-y:auto;">
          <div style="padding:1rem; text-align:center; color:var(--ink-400); font-size:0.83rem;">載入中...</div>
        </div>
      </div>
      <div id="cwp-chat" style="display:none;">
        <div class="cwp-header">
          <button onclick="showCWPList()">←</button>
          <span class="cwp-title" id="cwp-chat-title" style="margin-left:0.3rem;"></span>
          <a id="cwp-post-link" href="#" target="_blank">查看原貼文 →</a>
          <button onclick="toggleChatWidget()" style="margin-left:0.3rem;">✕</button>
        </div>
        <div id="cwp-messages"></div>
        <div class="cwp-input-row">
          <input type="text" id="cwp-input" placeholder="輸入訊息..." onkeydown="if(event.key==='Enter') sendCWPMsg()">
          <button onclick="sendCWPMsg()">送出</button>
        </div>
      </div>
    </div>
    <button id="chat-widget-btn" onclick="toggleChatWidget()" title="私訊">
      💬
      <span id="cwp-badge" style="display:none;"></span>
    </button>
  `;
  document.body.appendChild(widget);
}

function toggleChatWidget() {
  const panel = document.getElementById('chat-widget-panel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    showCWPList();
    loadCWPConversations();
  } else {
    clearInterval(cwpMsgInterval);
    cwpMsgInterval = null;
  }
}

async function loadCWPConversations() {
  const session = getSession();
  if (!session) return;
  const container = document.getElementById('cwp-conversations');
  if (!container) return;

  const convs = await getMyConversations(session.id);
  if (convs.length === 0) {
    container.innerHTML = '<div style="padding:1.2rem; text-align:center; color:var(--ink-400); font-size:0.83rem;">目前沒有任何對話</div>';
    return;
  }

  const items = await Promise.all(convs.map(async c => {
    const partner = c.participants.find(p => p.id !== session.id) || { name: '未知', id: '' };
    const msgs = await getMessages(c.postId, session.id, partner.id);
    const last = msgs[msgs.length - 1];
    const preview = last ? `${last.senderId === session.id ? '你：' : ''}${last.text}` : '尚無訊息';
    return { c, partner, preview };
  }));

  container.innerHTML = items.map(({ c, partner, preview }) => `
    <div class="cwp-conv-item" onclick="openCWPChat('${c.postId}','${partner.id}','${partner.name.replace(/'/g, "\\'")}')">
      <div class="cwp-conv-dot">💬</div>
      <div style="flex:1; min-width:0;">
        <div class="cwp-conv-name">${partner.name}</div>
        <div class="cwp-conv-preview">${preview}</div>
      </div>
      <a class="cwp-conv-link" href="detail.html?id=${c.postId}" target="_blank" onclick="event.stopPropagation()">查看貼文 →</a>
    </div>
  `).join('');
}

function openCWPChat(postId, partnerId, partnerName) {
  cwpCurrentPartner = { id: partnerId, name: partnerName };
  cwpCurrentPostId = postId;
  document.getElementById('cwp-list').style.display = 'none';
  document.getElementById('cwp-chat').style.display = 'block';
  document.getElementById('cwp-chat-title').textContent = partnerName;
  document.getElementById('cwp-post-link').href = `detail.html?id=${postId}`;
  loadCWPMessages();
  clearInterval(cwpMsgInterval);
  cwpMsgInterval = setInterval(loadCWPMessages, 3000);
}

function showCWPList() {
  clearInterval(cwpMsgInterval);
  cwpMsgInterval = null;
  const list = document.getElementById('cwp-list');
  const chat = document.getElementById('cwp-chat');
  if (list) list.style.display = 'block';
  if (chat) chat.style.display = 'none';
  loadCWPConversations();
}

async function loadCWPMessages() {
  const session = getSession();
  if (!session || !cwpCurrentPartner || !cwpCurrentPostId) return;
  const container = document.getElementById('cwp-messages');
  if (!container) return;

  const msgs = await getMessages(cwpCurrentPostId, session.id, cwpCurrentPartner.id);
  const wasAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 15;

  container.innerHTML = msgs.length === 0
    ? '<div style="text-align:center; color:var(--ink-400); font-size:0.82rem; padding:1rem;">還沒有訊息，發送第一則吧！</div>'
    : msgs.map(m => {
        const isMe = m.senderId === session.id;
        return `
          <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; width:100%;">
            <div class="chat-bubble ${isMe ? 'me' : 'them'}" style="margin:0; font-size:0.85rem;">
              ${m.text}
              <div class="chat-bubble-meta" style="text-align:${isMe ? 'right' : 'left'};">${isMe ? '你' : m.senderName} · ${timeAgo(m.time)}</div>
            </div>
          </div>`;
      }).join('');

  if (wasAtBottom || container.scrollTop === 0) container.scrollTop = container.scrollHeight;
}

async function sendCWPMsg() {
  const session = getSession();
  if (!session || !cwpCurrentPartner || !cwpCurrentPostId) return;
  const input = document.getElementById('cwp-input');
  const text = input.value.trim();
  if (!text) return;
  await sendMessage(cwpCurrentPostId, session.id, session.name, cwpCurrentPartner.id, cwpCurrentPartner.name, text);
  input.value = '';
  await loadCWPMessages();
}

// ── 權限守衛 ──
function requireLogin(redirect = 'login.html') {
  if (!isLoggedIn()) { window.location.href = redirect; return false; }
  return true;
}

function requireAdmin(redirect = 'index.html') {
  if (!isAdmin()) { window.location.href = redirect; return false; }
  return true;
}

// ── 錯誤訊息翻譯 ──
function translateAuthError(msg) {
  if (!msg) return '發生未知錯誤，請稍後再試';
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) return '帳號或密碼錯誤，請重新輸入';
  if (lower.includes('email not confirmed')) return '帳號尚未驗證，請聯繫管理員';
  if (lower.includes('user already registered') || lower.includes('already been registered')) return '此帳號已被註冊，請直接登入';
  if (lower.includes('email rate limit exceeded')) return '註冊請求過於頻繁，請稍後再試';
  if (lower.includes('password') && lower.includes('short')) return '密碼長度不足，至少需要 6 個字元';
  if (lower.includes('signup is disabled')) return '目前暫停註冊，請聯繫管理員';
  if (lower.includes('network')) return '網路連線異常，請檢查網路後再試';
  if (lower.includes('rate limit')) return '操作過於頻繁，請稍候再試';
  if (lower.includes('weak password')) return '密碼強度不足，請使用更安全的密碼';
  return msg; // 無法翻譯的直接回傳原文
}

// ── 示範資料 (已被資料庫 Seed 替代) ──
function seedDemoData() {
  // Supabase 資料庫已包含種子資料，免去前端種子邏輯
}

// ── Lightbox 全螢幕圖片檢視 ──
let lightboxImages = [];
let lightboxCurrentIndex = 0;

function openLightbox(images, index = 0) {
  lightboxImages = images || [];
  lightboxCurrentIndex = index;
  
  let lightbox = document.getElementById('lightbox-modal');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox-modal';
    lightbox.className = 'lightbox-modal';
    lightbox.innerHTML = `
      <span class="lightbox-close" onclick="closeLightbox()">&times;</span>
      <div class="lightbox-content-wrap">
        <button class="lightbox-arrow lightbox-arrow-left" onclick="lightboxPrev()">&#10094;</button>
        <img class="lightbox-img" id="lightbox-target-img" src="" alt="放大圖">
        <button class="lightbox-arrow lightbox-arrow-right" onclick="lightboxNext()">&#10095;</button>
      </div>
      <div class="lightbox-counter" id="lightbox-counter"></div>
    `;
    document.body.appendChild(lightbox);
    
    // 監聽鍵盤事件
    document.addEventListener('keydown', function(e) {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'ArrowLeft') lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
      if (e.key === 'Escape') closeLightbox();
    });
    
    // 點擊背景關閉
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox || e.target.classList.contains('lightbox-content-wrap')) {
        closeLightbox();
      }
    });
  }
  
  lightbox.classList.add('active');
  updateLightbox();
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox-modal');
  if (lightbox) {
    lightbox.classList.remove('active');
  }
}

function updateLightbox() {
  const img = document.getElementById('lightbox-target-img');
  const counter = document.getElementById('lightbox-counter');
  const leftArrow = document.querySelector('.lightbox-arrow-left');
  const rightArrow = document.querySelector('.lightbox-arrow-right');
  
  if (!img || !lightboxImages || lightboxImages.length === 0) return;
  
  img.src = lightboxImages[lightboxCurrentIndex];
  
  // 更新計數器
  if (counter) {
    counter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;
  }
  
  // 如果只有一張圖，隱藏箭頭；否則顯示
  if (lightboxImages.length <= 1) {
    if (leftArrow) leftArrow.style.display = 'none';
    if (rightArrow) rightArrow.style.display = 'none';
  } else {
    if (leftArrow) leftArrow.style.display = 'block';
    if (rightArrow) rightArrow.style.display = 'block';
  }
}

function lightboxPrev() {
  if (!lightboxImages || lightboxImages.length <= 1) return;
  lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxImages.length) % lightboxImages.length;
  updateLightbox();
}

function lightboxNext() {
  if (!lightboxImages || lightboxImages.length <= 1) return;
  lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxImages.length;
  updateLightbox();
}

// ── 客服與私訊全域模態框 ──
let globalChatPartnerId = null;
let globalChatPartnerName = null;
let globalChatPostId = 'support';
let globalChatInterval = null;

function openGlobalChat(partnerId, partnerName, postId = 'support', title = '客服諮詢') {
  const session = getSession();
  if (!session) {
    alert('請先登入才能使用此功能');
    window.location.href = 'login.html';
    return;
  }
  
  // Prevent chatting with yourself
  if (session.id === partnerId) {
    alert('這是您自己的帳號，無法進行對話。');
    return;
  }
  
  globalChatPartnerId = partnerId;
  globalChatPartnerName = partnerName;
  globalChatPostId = postId;
  
  let modal = document.getElementById('global-chat-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-chat-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1010';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3 id="global-chat-title">💬 ${title}</h3>
          <button class="modal-close" onclick="closeGlobalChat()">✕</button>
        </div>
        <div class="modal-body">
          <div class="chat-messages" id="global-chat-messages" style="height:300px; overflow-y:auto; padding:0.8rem; display:flex; flex-direction:column; gap:0.6rem; background:var(--sand-50); border-radius:var(--radius); border:1px solid var(--sand-100);"></div>
          <div class="chat-input-row" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
            <input type="text" id="global-chat-input" placeholder="輸入訊息..." style="flex:1;" onkeydown="if(event.key==='Enter') sendGlobalChatMsg()">
            <button class="btn btn-primary" onclick="sendGlobalChatMsg()">傳送</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeGlobalChat();
      }
    });
  }
  
  document.getElementById('global-chat-title').textContent = `💬 ${title}`;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  
  loadGlobalChatMessages();
  
  if (globalChatInterval) clearInterval(globalChatInterval);
  globalChatInterval = setInterval(loadGlobalChatMessages, 3000);
  
  setTimeout(() => {
    const input = document.getElementById('global-chat-input');
    if (input) input.focus();
  }, 100);
}

function closeGlobalChat() {
  const modal = document.getElementById('global-chat-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  if (globalChatInterval) {
    clearInterval(globalChatInterval);
    globalChatInterval = null;
  }
}

async function loadGlobalChatMessages() {
  if (!globalChatPartnerId) return;
  const session = getSession();
  if (!session) return;
  
  const container = document.getElementById('global-chat-messages');
  if (!container) return;
  
  const msgs = await getMessages(globalChatPostId, session.id, globalChatPartnerId);
  
  const wasScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 15;
  
  container.innerHTML = msgs.map(m => {
    const isMe = m.senderId === session.id;
    return `
      <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; width: 100%;">
        <div class="chat-bubble ${isMe ? 'me' : 'them'}" style="margin: 0;">
          ${m.text}
          <div class="chat-bubble-meta" style="text-align:${isMe ? 'right' : 'left'};">${isMe ? '你' : m.senderName} · ${timeAgo(m.time)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  if (wasScrolledToBottom || container.scrollTop === 0) {
    container.scrollTop = container.scrollHeight;
  }
}

async function sendGlobalChatMsg() {
  const input = document.getElementById('global-chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  
  const session = getSession();
  if (!session) return;
  
  const ok = await sendMessage(globalChatPostId, session.id, session.name, globalChatPartnerId, globalChatPartnerName, text);
  if (ok) {
    input.value = '';
    await loadGlobalChatMessages();
  }
}
