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
    return { id: studentId, name: name, isAdmin: isAdmin, uuid: data.user.id };
  } catch ( hisError) {
    return null;
  }
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
    .order('created_at', { ascending: false });
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
    name: claim.name,
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
  
  const post = await getPost(postId);
  const postTitle = post ? post.title : '（已刪除貼文）';
  
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
          <div class="avatar">${initial}</div>
          <span class="nav-profile-text">個人中心</span>
        </a>
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
      <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${session.name.charAt(0).toUpperCase()}</div>
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
