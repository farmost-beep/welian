// Auto-generated from app.js — do not edit manually

import { CLOUD_URL, I18N, MODEL_TIERS, PAY_AMOUNTS, body, currentLang, currentModelTier, currentOrder, input, setCurrentModelTier, setCurrentOrder, setPAY_AMOUNTS } from './state.js';
import { escapeHtml } from './misc.js';
import { getClerkToken } from './auth.js';

export async function loadBillingTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.billing_loading}</div>`;
  const token = await getClerkToken();
  if (!token) {
    content.innerHTML = `<div class="mine-empty">${d.billing_not_authed}</div>`;
    return;
  }
  try {
    const [billingResp, pricingResp, adminResp] = await Promise.all([
      fetch(`${CLOUD_URL}/ai/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_token: token }),
      }),
      fetch(`${CLOUD_URL}/ai/pricing`),
      fetch(`${CLOUD_URL}/ai/admin/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_token: token }),
      }),
    ]);
    if (!billingResp.ok) throw new Error(`HTTP ${billingResp.status}`);
    const info = await billingResp.json();
    const pricing = await pricingResp.json();
    window._currentPricing = pricing; // cache for cost preview
    const adminResult = await adminResp.json();
    renderBillingTab(info, pricing, adminResult.is_admin);
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${d.billing_error}${e.message}</div>`;
  }
}

export function renderBillingTab(info, pricing, isAdmin) {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  const p = pricing || {};
  const planLabel = info.plan === 'pro' ? d.billing_pro : d.billing_free;
  const remaining = Math.round((info.remaining ?? 0) * 10) / 10;
  const allowance = info.allowance ?? 100;
  const used = Math.round((info.used ?? 0) * 10) / 10;
  const purchased = info.purchased ?? 0;
  const rollover = info.rollover ?? 0;
  const total = allowance + rollover + purchased;
  const pct = total > 0 ? Math.min(100, Math.round(remaining / total * 100)) : 0;
  const isPro = info.plan === 'pro';

  const history = (info.recent_history || []).slice(-5).reverse();
  const historyHtml = history.length ? history.map(h => {
    const dt = new Date(h.date).toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
    const action = h.action === 'upgrade' ? d.billing_upgrade : (h.action === 'purchase' ? d.billing_buy : h.action);
    const pts = h.points || 0;
    const ptsLabel = pts > 0 ? ` · <span style="color:#e8a040">-${pts}</span>` : (pts < 0 ? ` · <span style="color:var(--green)">+${Math.abs(pts)}</span>` : '');
    return `<div class="mine-contact"><div class="mine-contact-sub">${dt} · ${action}${ptsLabel}</div><div class="mine-contact-sub">${escapeHtml(h.detail || '')}</div></div>`;
  }).join('') : `<div class="mine-empty">${d.billing_no_history}</div>`;

  const proPrice = p.pro_price_usd_display ?? p.pro_price_usd ?? 4.99;
  const proPriceYearly = p.pro_price_yearly_usd_display ?? p.pro_price_yearly_usd ?? 49;
  const proMonthly = p.pro_monthly ?? 500;
  const pack100Price = p.credit_pack_100_usd_display ?? p.credit_pack_100_usd ?? 1.99;
  const pack500Price = p.credit_pack_500_usd_display ?? p.credit_pack_500_usd ?? 7.99;
  const discount = p.discount ?? 100;

  // Update dynamic pay amounts
  setPAY_AMOUNTS({
    pro_monthly: proPrice,
    pro_yearly: proPriceYearly,
    '100': pack100Price,
    '500': pack500Price,
  });

  // Admin pricing management section
  const adminHtml = isAdmin ? `
    <div class="mine-section-title">⚙️ 定价管理 <span style="font-size:.7em;color:var(--dimmer)">(运营者)</span></div>
    <div class="mine-card" style="padding:14px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;padding:10px;background:var(--bg);border-radius:8px">
        <span style="font-size:.82em;color:var(--dim);white-space:nowrap">统一打折</span>
        <input type="number" id="admin_discount" value="${discount}" min="0" max="100" step="5" style="width:70px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.9em;background:var(--surface);color:var(--text);text-align:center" onchange="applyDiscount(this.value)">
        <span style="font-size:.82em;color:var(--dim)">%</span>
        <button onclick="applyDiscount(document.getElementById('admin_discount').value)" style="padding:5px 12px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:.82em;cursor:pointer;font-family:inherit">应用</button>
        <span id="discountHint" style="font-size:.72em;color:var(--dimmer);margin-left:auto"></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <label style="font-size:.78em;color:var(--dim)">Pro 月费 ($)<input type="number" id="admin_pro_price" value="${p.pro_price_usd ?? 4.99}" step="0.1" class="input-box-style" data-original="${p.pro_price_usd ?? 4.99}"></label>
        <label style="font-size:.78em;color:var(--dim)">Pro 年费 ($)<input type="number" id="admin_pro_price_yearly" value="${p.pro_price_yearly_usd ?? 49}" step="1" class="input-box-style" data-original="${p.pro_price_yearly_usd ?? 49}"></label>
        <label style="font-size:.78em;color:var(--dim)">Pro 月联点<input type="number" id="admin_pro_monthly" value="${proMonthly}" step="10" class="input-box-style"></label>
        <label style="font-size:.78em;color:var(--dim)">免费月联点<input type="number" id="admin_free_monthly" value="${p.free_monthly ?? 100}" step="10" class="input-box-style"></label>
        <label style="font-size:.78em;color:var(--dim)">100点包价格 ($)<input type="number" id="admin_credit_pack_100" value="${p.credit_pack_100_usd ?? 1.99}" step="0.1" class="input-box-style" data-original="${p.credit_pack_100_usd ?? 1.99}"></label>
        <label style="font-size:.78em;color:var(--dim)">500点包价格 ($)<input type="number" id="admin_credit_pack_500" value="${p.credit_pack_500_usd ?? 7.99}" step="0.1" class="input-box-style" data-original="${p.credit_pack_500_usd ?? 7.99}"></label>
        <label style="font-size:.78em;color:var(--dim)">每1K输入联点<input type="number" id="admin_points_per_1k_input" value="${p.points_per_1k_input ?? 1}" step="0.1" class="input-box-style"></label>
        <label style="font-size:.78em;color:var(--dim)">每1K输出联点<input type="number" id="admin_points_per_1k_output" value="${p.points_per_1k_output ?? 2}" step="0.1" class="input-box-style"></label>
        <label style="font-size:.78em;color:var(--dim)">标准模型倍率<input type="number" id="admin_mult_standard" value="${(p.model_multipliers||{}).standard ?? 1}" step="0.5" class="input-box-style"></label>
        <label style="font-size:.78em;color:var(--dim)">增强模型倍率<input type="number" id="admin_mult_enhanced" value="${(p.model_multipliers||{}).enhanced ?? 3}" step="0.5" class="input-box-style"></label>
        <label style="font-size:.78em;color:var(--dim)">高级模型倍率<input type="number" id="admin_mult_premium" value="${(p.model_multipliers||{}).premium ?? 10}" step="1" class="input-box-style"></label>
      </div>
      <button onclick="savePricing()" style="width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:.9em;cursor:pointer;font-family:inherit">保存定价</button>
      <div id="adminPricingResult" style="text-align:center;font-size:.8em;margin-top:8px"></div>
    </div>
  ` : '';

  content.innerHTML = `
    <div class="mine-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:.85em;color:var(--dim)">${d.billing_current}</span>
        <span class="mine-tag ${isPro ? 'nurture' : 'dual'}">${planLabel}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <span style="font-size:.85em;color:var(--dim)">${d.billing_remaining}</span>
        <span style="font-size:1.4em;font-weight:600;color:var(--accent)">${remaining} <span style="font-size:.6em;color:var(--dim)">/ ${total}</span></span>
      </div>
      <div class="mine-billing-bar"><div class="mine-billing-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:.75em;color:var(--dimmer)">
        <span>${d.billing_used}: ${used}</span>
        <span>${d.billing_allowance}: ${allowance}</span>
        ${rollover > 0 ? `<span>滚存: ${rollover}</span>` : ''}
        ${purchased > 0 ? `<span>${d.billing_purchased}: ${purchased}</span>` : ''}
      </div>
      <p style="font-size:.72em;color:var(--dimmer);margin-top:8px;text-align:center">${d.billing_reset}</p>
    </div>
    <div class="mine-section-title">${d.billing_upgrade}</div>
    ${info.subscription && info.subscription.status === 'active' && info.subscription.paddle_subscription_id ? `
    <div class="mine-card" style="padding:14px;margin-bottom:12px;border:1px solid var(--accent)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:.9em;font-weight:600;color:var(--accent)">${currentLang==='zh'?'当前订阅':'Active Subscription'}</div>
          <div style="font-size:.75em;color:var(--dimmer)">${info.subscription.plan === 'pro_yearly' ? (currentLang==='zh'?'Pro 年度':'Pro Yearly') : (currentLang==='zh'?'Pro 月度':'Pro Monthly')}</div>
        </div>
        <button onclick="paddleCancelSub()" id="cancelSubBtn" class="btn-secondary">${currentLang==='zh'?'取消订阅':'Cancel'}</button>
      </div>
      <div id="cancelSubResult" style="font-size:.8em;text-align:center;margin-top:8px"></div>
    </div>
    ` : ''}
    <div class="mine-card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-size:.9em;font-weight:600">${d.billing_pro_monthly}</div><div style="font-size:.75em;color:var(--dimmer)">${currentLang==='zh'?'每月 500 联点':'500 credits/month'}</div></div>
        <button onclick="paddleCheckout('pro_monthly')" style="padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.85em;cursor:pointer;font-family:inherit" id="btn_pro_monthly">$${Number(proPrice).toFixed(2)}/mo</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
        <div><div style="font-size:.9em;font-weight:600">${d.billing_pro_yearly}</div><div style="font-size:.75em;color:var(--dimmer)">${currentLang==='zh'?'每月 500 联点 · 省 17%':'500 credits/month · save 17%'}</div></div>
        <button onclick="paddleCheckout('pro_yearly')" style="padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.85em;cursor:pointer;font-family:inherit" id="btn_pro_yearly">$${Number(proPriceYearly).toFixed(2)}/yr</button>
      </div>
    </div>
    <div class="mine-section-title">${d.billing_buy}</div>
    <div class="mine-card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-size:.9em;font-weight:600">${d.billing_pack_100}</div><div style="font-size:.75em;color:var(--dimmer)">${currentLang==='zh'?'一次性购买':'One-time purchase'}</div></div>
        <button onclick="paddleCheckout('credits_100')" class="btn-secondary" id="btn_credits_100">$${Number(pack100Price).toFixed(2)}</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
        <div><div style="font-size:.9em;font-weight:600">${d.billing_pack_500}</div><div style="font-size:.75em;color:var(--dimmer)">${currentLang==='zh'?'一次性购买 · 省 20%':'One-time · save 20%'}</div></div>
        <button onclick="paddleCheckout('credits_500')" class="btn-secondary" id="btn_credits_500">$${Number(pack500Price).toFixed(2)}</button>
      </div>
    </div>
    <div class="mine-section-title">🎁 ${currentLang==='zh'?'赠予联点':'Gift Credits'}</div>
    <div class="mine-card" style="padding:14px">
      <input type="email" id="giftEmail" placeholder="${currentLang==='zh'?'收件人邮箱':'Recipient email'}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:.9em;background:var(--surface);color:var(--text);margin-bottom:8px;box-sizing:border-box">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input type="number" id="giftPoints" placeholder="${currentLang==='zh'?'联点数 (10-500)':'Points (10-500)'}" min="10" max="500" step="10" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:.9em;background:var(--surface);color:var(--text);box-sizing:border-box">
        <button onclick="doGiftCredits()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.9em;cursor:pointer;font-family:inherit;white-space:nowrap">${currentLang==='zh'?'赠送':'Send'}</button>
      </div>
      <div id="giftResult" style="font-size:.8em;text-align:center"></div>
    </div>
    <div class="mine-section-title">🎟️ ${d.coupon_title}</div>
    <div class="mine-card" style="padding:14px">
      <div style="display:flex;gap:8px">
        <input type="text" id="couponCode" placeholder="${d.coupon_ph}" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:.9em;background:var(--surface);color:var(--text);box-sizing:border-box;text-transform:uppercase">
        <button onclick="doRedeemCoupon()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.9em;cursor:pointer;font-family:inherit;white-space:nowrap">${d.coupon_redeem}</button>
      </div>
      <div id="couponResult" style="font-size:.8em;text-align:center;margin-top:8px"></div>
    </div>
    <div class="mine-section-title">${d.billing_history}</div>
    <div class="mine-card">${historyHtml}</div>
    ${adminHtml}
  `;
}

export async function loadInviteSection() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('inviteContent');
  if (!el) return;
  try {
    const token = await getClerkToken();
    const resp = await fetch(`${CLOUD_URL}/ai/invite/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const data = await resp.json();
    if (!data.ok) { el.textContent = zh ? '请先登录' : 'Please sign in'; return; }
    const inviteUrl = `https://welian.app/?ref=${data.code}`;
    const invited = data.invited || 0;
    const maxInvites = data.max_invites || 50;
    const totalCredits = data.total_credits || 0;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="flex:1;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:1em;font-weight:600;color:var(--accent);letter-spacing:1px">${data.code}</div>
        <button onclick="copyInviteCode('${data.code}')" style="padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8em;white-space:nowrap">${zh?'复制码':'Copy'}</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <input type="text" value="${inviteUrl}" readonly id="inviteUrlInput" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.78em;background:var(--surface);color:var(--text);box-sizing:border-box">
        <button onclick="copyInviteUrl()" style="padding:6px 10px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.78em;white-space:nowrap">${zh?'复制链接':'Copy'}</button>
      </div>
      <div style="display:flex;gap:16px;margin-top:8px">
        <div><span style="font-size:1.2em;font-weight:600;color:var(--accent)">${invited}</span><span style="font-size:.78em;color:var(--dim)">/${maxInvites} ${zh?'已邀请':'invited'}</span></div>
        <div><span style="font-size:1.2em;font-weight:600;color:var(--accent)">${totalCredits}</span> <span style="font-size:.78em;color:var(--dim)">${zh?'联点奖励':'credits earned'}</span></div>
      </div>
    `;
  } catch (e) {
    el.textContent = (zh ? '加载失败: ' : 'Load failed: ') + e.message;
  }
}

export function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    const zh = currentLang === 'zh';
    alert(zh ? '邀请码已复制' : 'Invite code copied');
  });
}

export function copyInviteUrl() {
  const input = document.getElementById('inviteUrlInput');
  if (input) {
    navigator.clipboard.writeText(input.value).then(() => {
      const zh = currentLang === 'zh';
      alert(zh ? '邀请链接已复制，去微信粘贴分享吧' : 'Invite link copied');
    });
  }
}

export function applyDiscount(percent) {
  const pct = parseFloat(percent);
  if (isNaN(pct) || pct < 0 || pct > 100) return;
  const ratio = pct / 100;
  const priceFields = ['admin_pro_price', 'admin_pro_price_yearly', 'admin_credit_pack_100', 'admin_credit_pack_500'];
  priceFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const original = parseFloat(el.dataset.original);
      if (isNaN(original)) return;
      el.value = (original * ratio).toFixed(2);
    }
  });
  const hint = document.getElementById('discountHint');
  if (hint) hint.textContent = pct === 100 ? '' : `已应用 ${pct}% 折扣`;
  // Update purchase buttons and PAY_AMOUNTS to match discounted prices
  const discounted = {
    pro_monthly: parseFloat(document.getElementById('admin_pro_price').value),
    pro_yearly: parseFloat(document.getElementById('admin_pro_price_yearly').value),
    '100': parseFloat(document.getElementById('admin_credit_pack_100').value),
    '500': parseFloat(document.getElementById('admin_credit_pack_500').value),
  };
  setPAY_AMOUNTS(discounted);
  const btnMap = { btn_pro_monthly: `$${discounted.pro_monthly}/mo`, btn_pro_yearly: `$${discounted.pro_yearly}/yr`, btn_credits_100: `$${discounted['100']}`, btn_credits_500: `$${discounted['500']}` };
  Object.entries(btnMap).forEach(([id, label]) => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = label;
  });
}

export async function savePricing() {
  const token = await getClerkToken();
  if (!token) { alert('请先登录'); return; }
  const fields = ['pro_price_usd','pro_price_yearly_usd','pro_monthly','free_monthly','credit_pack_100_usd','credit_pack_500_usd','points_per_1k_input','points_per_1k_output'];
  const body = {};
  for (const f of fields) {
    const el = document.getElementById('admin_' + f.replace('_usd',''));
    if (el) {
      // Use original (pre-discount) value if available, so we save base price not discounted
      const original = el.dataset.original ? parseFloat(el.dataset.original) : parseFloat(el.value);
      body[f] = original;
    }
  }
  // Save discount
  const discountEl = document.getElementById('admin_discount');
  if (discountEl) body.discount = parseFloat(discountEl.value);
  const ms = document.getElementById('admin_mult_standard');
  const me = document.getElementById('admin_mult_enhanced');
  const mp = document.getElementById('admin_mult_premium');
  if (ms && me && mp) {
    body.model_multipliers = {
      standard: parseFloat(ms.value),
      enhanced: parseFloat(me.value),
      premium: parseFloat(mp.value),
    };
  }
  const resultEl = document.getElementById('adminPricingResult');
  if (resultEl) resultEl.innerHTML = '保存中…';
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/admin/pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ...body, session_token: token }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--accent)">✓ 已保存</span>';
      // Update cached pricing so cost preview uses new prices, but don't re-render panel
      // (re-render would overwrite discounted button prices)
      window._currentPricing = { ...window._currentPricing, ...body };
    } else {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${data.error || '保存失败'}</span>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
}

export async function paddleCheckout(product) {
  const token = await getClerkToken();
  if (!token) { alert(currentLang === 'zh' ? '请先登录' : 'Please sign in first'); return; }
  // Ensure Paddle is initialized (async init may still be in flight)
  if (!window.paddleInitialized) await window.initPaddle();
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/paddle/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ product, session_token: token }),
    });
    const data = await resp.json();
    console.log('[checkout] Response:', JSON.stringify({ price_id: data.price_id, discount_id: data.discount_id, error: data.error, product }));
    if (resp.ok && data.price_id) {
      if (typeof window.Paddle !== 'undefined') {
        const checkoutOpts = {
          items: [{ priceId: data.price_id, quantity: 1 }],
          customData: {
            user_id: data.user_id,
            product_type: data.product_type,
            product_id: data.product_id,
          },
          settings: {
            successUrl: window.location.origin + '?billing=1',
          },
        };
        if (data.discount_id) checkoutOpts.discountId = data.discount_id;
        console.log('[checkout] Opening Paddle with opts:', JSON.stringify({ discountId: checkoutOpts.discountId, priceId: checkoutOpts.items[0].priceId }));
        window.Paddle.Checkout.open(checkoutOpts);
      } else {
        alert(currentLang === 'zh' ? 'Paddle 未加载，请刷新页面' : 'Paddle not loaded, please refresh');
      }
    } else {
      alert((currentLang === 'zh' ? '支付发起失败: ' : 'Checkout failed: ') + (data.error || 'unknown'));
    }
  } catch (e) {
    alert((currentLang === 'zh' ? '网络错误: ' : 'Network error: ') + e.message);
  }
}

export async function paddleCancelSub() {
  const token = await getClerkToken();
  if (!token) { alert(currentLang === 'zh' ? '请先登录' : 'Please sign in first'); return; }
  const btn = document.getElementById('cancelSubBtn');
  const resultEl = document.getElementById('cancelSubResult');
  if (!confirm(currentLang === 'zh' ? '确定取消订阅？取消后当前周期结束前仍有效。' : 'Cancel subscription? Access continues until period ends.')) return;
  if (btn) btn.disabled = true;
  if (resultEl) resultEl.innerHTML = currentLang === 'zh' ? '取消中…' : 'Canceling…';
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/paddle/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent)">${currentLang === 'zh' ? '✓ 已取消' : '✓ Canceled'}</span>`;
      setTimeout(() => loadBillingTab(), 1500);
    } else {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${data.error || 'failed'}</span>`;
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
    if (btn) btn.disabled = false;
  }
}

export async function doGiftCredits() {
  const token = await getClerkToken();
  if (!token) { alert('请先登录'); return; }
  const email = document.getElementById('giftEmail')?.value?.trim();
  const points = parseFloat(document.getElementById('giftPoints')?.value);
  const resultEl = document.getElementById('giftResult');
  if (!email || !points) { if (resultEl) resultEl.innerHTML = '<span style="color:#e74c3c">请填写邮箱和联点数</span>'; return; }
  if (points < 10 || points > 500) { if (resultEl) resultEl.innerHTML = '<span style="color:#e74c3c">联点数需在 10-500 之间</span>'; return; }
  if (resultEl) resultEl.innerHTML = '发送中…';
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/gift_credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ recipient_email: email, points, session_token: token }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent)">✓ 已赠送 ${data.gifted} 联点给 ${email}，剩余 ${data.remaining}</span>`;
      document.getElementById('giftEmail').value = '';
      document.getElementById('giftPoints').value = '';
      setTimeout(() => loadBillingTab(), 1500);
    } else {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${data.error || '赠送失败'}</span>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
}

export async function doRedeemCoupon() {
  const d = I18N[currentLang];
  const token = await getClerkToken();
  if (!token) { alert(d.signin_prompt); return; }
  const code = document.getElementById('couponCode')?.value?.trim();
  const resultEl = document.getElementById('couponResult');
  if (!code) { if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">${d.coupon_ph}</span>`; return; }
  if (resultEl) resultEl.innerHTML = d.roleplay_loading;
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/redeem_coupon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ code, session_token: token }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent)">✓ ${d.coupon_success.replace('{points}', data.points)}</span>`;
      document.getElementById('couponCode').value = '';
      setTimeout(() => loadBillingTab(), 1500);
    } else {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${data.error || d.coupon_invalid}</span>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
}

export function openPayModal(type, id) {
  const d = I18N[currentLang];
  const amount = PAY_AMOUNTS[id] || 0;
  const name = type === 'upgrade' ? (id === 'pro_yearly' ? d.billing_pro_yearly : d.billing_pro_monthly) : (id === '500' ? d.billing_pack_500 : d.billing_pack_100);
  setCurrentOrder({ type, id, amount, name });

  document.getElementById('payTitle').textContent = d.pay_title;
  document.getElementById('payBody').innerHTML = `
    <div style="font-size:1.1em;font-weight:500;margin-bottom:4px">${escapeHtml(name)}</div>
    <div style="font-size:.8em;color:var(--dim);margin-bottom:16px">${d.pay_amount}: $${amount}</div>
    <img src="/wechat-pay-qr.png" style="width:240px;height:auto;border-radius:12px;margin:0 auto 12px;display:block" alt="WeChat Pay QR">
    <p style="font-size:.82em;color:var(--dim);margin-bottom:16px">${d.pay_scan}</p>
    <button onclick="confirmPayment()" style="width:100%;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:.95em;cursor:pointer;font-family:inherit;margin-bottom:8px">${d.pay_done}</button>
    <button onclick="closePayModal()" style="width:100%;padding:10px;background:none;color:var(--dim);border:1px solid var(--border);border-radius:10px;font-size:.85em;cursor:pointer;font-family:inherit">${d.pay_cancel}</button>
  `;
  document.getElementById('payOverlay').classList.add('show');
  document.getElementById('payModal').classList.add('show');
}

export function closePayModal() {
  document.getElementById('payOverlay').classList.remove('show');
  document.getElementById('payModal').classList.remove('show');
  setCurrentOrder(null);
}

export async function confirmPayment() {
  const d = I18N[currentLang];
  if (!currentOrder) return;
  const token = await getClerkToken();
  if (!token) return;

  // Show pending state
  document.getElementById('payBody').innerHTML = `
    <div style="padding:40px 0">
      <div style="font-size:2em;margin-bottom:12px">⏳</div>
      <div style="font-size:1em;font-weight:500;margin-bottom:4px">${d.pay_pending}</div>
      <div style="font-size:.8em;color:var(--dim)">${d.pay_pending_sub}</div>
    </div>
  `;

  // Create a pending order on the server
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/create_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, type: currentOrder.type, id: currentOrder.id, amount: currentOrder.amount }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    // Auto-confirm for now (manual confirmation will be added later)
    // In production, this would poll for payment confirmation
    const confirmResp = await fetch(`${CLOUD_URL}/ai/confirm_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, order_id: data.order_id }),
    });
    if (!confirmResp.ok) throw new Error(`HTTP ${confirmResp.status}`);
    await confirmResp.json();

    document.getElementById('payBody').innerHTML = `
      <div style="padding:40px 0">
        <div style="font-size:2em;margin-bottom:12px">✅</div>
        <div style="font-size:1em;font-weight:500;margin-bottom:4px">${d.pay_confirmed}</div>
      </div>
      <button onclick="closePayModal();loadBillingTab()" style="width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:.9em;cursor:pointer;font-family:inherit">OK</button>
    `;
  } catch (e) {
    document.getElementById('payBody').innerHTML = `
      <div style="padding:40px 0">
        <div style="font-size:2em;margin-bottom:12px">❌</div>
        <div style="font-size:.85em;color:var(--dim)">${d.pay_failed}</div>
      </div>
      <button onclick="closePayModal()" style="width:100%;padding:10px;background:none;color:var(--dim);border:1px solid var(--border);border-radius:10px;font-size:.85em;cursor:pointer;font-family:inherit">${d.pay_cancel}</button>
    `;
  }
}

export async function doUpgrade(plan) {
  openPayModal('upgrade', plan);
}

export async function doPurchase(pack) {
  openPayModal('purchase', pack);
}

export function setModelTier(tier) {
  setCurrentModelTier(tier);
  localStorage.setItem('welian_model_tier', tier);
  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tier === tier);
  });
  updateCostPreview();
}

export async function updateCostPreview() {
  const d = I18N[currentLang];
  const el = document.getElementById('costPreview');
  if (!el) return;
  // Local calculation: chat ≈ 2000 input + 500 output tokens
  const COST_EST = { input: 2000, output: 500 };
  const tierMult = MODEL_TIERS[currentModelTier]?.multiplier || 1;
  const pricing = window._currentPricing || { points_per_1k_input: 0.2, points_per_1k_output: 0.4 };
  const basePoints = COST_EST.input / 1000 * pricing.points_per_1k_input + COST_EST.output / 1000 * pricing.points_per_1k_output;
  const points = Math.round(basePoints * tierMult * 10) / 10;
  el.textContent = `${d.cost_preview}: ~${points} ${d.cost_points}`;
}

export function showModelTierBar() {
  const bar = document.getElementById('modelTierBar');
  if (bar) bar.style.display = 'flex';
  // Restore saved tier selection
  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tier === currentModelTier);
  });
  updateCostPreview();
}

export function showCostPreview(estimatedPoints) {
  const d = I18N[currentLang];
  return `${d.cost_preview}: ~${estimatedPoints} ${d.cost_points}`;
}
