// ── Config ──
export const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsud2VsaWFuLmFwcCQ';
export const DISCOVERY_URL = 'https://welian-ai.farmost.workers.dev';
export const AGENT_TUNNEL_URL = 'https://agent.welian.app';  // Direct tunnel (no discovery needed)
export const CLOUD_URL = 'https://api.welian.app';  // Cloud AI gateway (方案C)

// ── i18n ──
export const I18N = {
  en: {
    tagline: 'Care <em>more</em>.',
    tagline_sub: 'Better friend. Better family. Better collaborator.',
    demo: 'Demo',
    welcome: "Hi, I'm Welian 😊\n\nI remember what matters, suggest who to reach out to, and help you find the right words.\n\nSign in to get started.",
    signin_prompt: 'Please sign in to start chatting. 🔑',
    input_ph: 'Message Welian…',
    hint_reach: 'Who to reach out to',
    hint_reach_desc: 'See who deserves a check-in',
    hint_overview: 'Contacts overview',
    hint_overview_desc: 'Understand your network',
    hint_note: 'Quick note',
    hint_note_desc: 'Log an interaction or meeting',
    hint_draft: 'Draft a message',
    hint_draft_desc: 'Write the right words for someone',
    hint_review: 'Monthly review',
    privacy: 'Your data stays on your device.',
    auth_title: 'Welcome to Welian',
    auth_sub: 'Sign in to start managing your relationships',
    no_account: 'No account?',
    sign_up_link: 'Sign up',
    or: 'or',
    wechat_login: 'WeChat Login',
    phone_login: 'Phone Login',
    sign_in: 'Sign in',
    phone_title: 'Phone Login',
    phone_ph: 'Enter phone number',
    phone_send: 'Send code',
    phone_sending: 'Sending…',
    phone_code_ph: 'Enter verification code',
    phone_verify: 'Verify & sign in',
    phone_verifying: 'Verifying…',
    phone_sent: 'Code sent',
    phone_err: 'Send failed: ',
    phone_err_code: 'Invalid or expired code',
    phone_err_phone: 'Please enter a valid phone number',
    phone_back: 'Back',
    phone_countdown: 's to resend',
    looking: 'Connecting…',
    connecting: 'Connecting…',
    connected: "Connected ✅\n\nYour data is in the cloud, I only see what you tell me.\n\nTry \"who to reach out to\" or \"note: met with X about Y\"",
    live_welcome: "Live mode connected ✅\n\nI'm Welian, powered by Devin. I can autonomously read your contacts, draft messages, manage todos, and run multi-step tasks — writing code, browsing the web, and using tools to get things done end-to-end.\n\nTry \"who should I reach out to?\" or \"note: met with X about Y\"",
    not_found: 'Local data not found',
    not_found_desc: 'Your data stays on your computer. Start Welian on your computer to connect.',
    retry: 'Retry',
    cloud_status: 'Cloud',
    cloud_welcome: "Hi, I'm Welian 😊\n\nI can help you think through relationships, draft messages, and suggest who to reach out to.\n\nTry these:\n• \"note: met with John about the project\"\n• \"who should I reach out to?\"\n• \"draft a message to Sarah\"\n\nWhat's on your mind?",
    cloud_error: 'Error: ',
    live_upgraded: 'Local agent connected ✅ Data synced from your device.',
    live_available: '💡 Local data detected! Refresh to enable full features.',
    billing_btn: 'Plan',
    billing_title: 'Plan & Credits',
    billing_sub: 'Manage your AI credits',
    billing_loading: 'Loading…',
    billing_current: 'Current Plan',
    billing_remaining: 'Remaining',
    billing_used: 'Used this month',
    billing_allowance: 'Monthly allowance',
    billing_purchased: 'Purchased credits',
    billing_reset: 'Resets monthly',
    billing_upgrade: 'Upgrade',
    billing_buy: 'Buy',
    billing_pro_monthly: 'Pro Monthly',
    billing_pro_yearly: 'Pro Yearly',
    billing_pack_100: '100 Credits',
    billing_pack_500: '500 Credits',
    billing_free: 'Free',
    billing_pro: 'Pro',
    billing_confirm_upgrade: 'Upgrade to',
    billing_confirm_buy: 'Buy',
    billing_success: 'Done ✓',
    billing_error: 'Failed: ',
    billing_not_authed: 'Please sign in first.',
    billing_history: 'Recent history',
    billing_no_history: 'No history yet',
    pay_title: 'WeChat Pay',
    pay_scan: 'Scan with WeChat to pay',
    pay_amount: 'Amount',
    pay_done: 'I have paid',
    pay_cancel: 'Cancel',
    pay_pending: 'Payment confirmation…',
    pay_pending_sub: 'We will confirm your payment shortly',
    pay_confirmed: 'Payment confirmed ✓',
    pay_failed: 'Payment not found, please contact contact@welian.app',
    mine_btn: 'Me',
    support_btn: 'Support',
    tab_overview: 'Overview',
    tab_contacts: 'Contacts',
    tab_weekly: 'Weekly',
    tab_billing: 'Plan',
    mine_title: 'Me',
    mine_loading: 'Loading…',
    mine_empty: 'No data yet',
    mine_empty_contacts: 'No contacts yet. Start chatting with Welian to add contacts.',
    mine_empty_todos: 'No pending todos',
    mine_empty_timeline: 'No recent interactions',
    mine_overview_title: 'This Month',
    mine_contacts_total: 'contacts',
    mine_todos_pending: 'pending todos',
    mine_interactions: 'this month',
    mine_leverage: 'Leverage',
    mine_nurture: 'Nurture',
    mine_dual: 'Dual',
    mine_last_contact: 'Last contact',
    mine_no_date: '—',
    mine_search_ph: 'Search contacts…',
    mine_all: 'All',
    mine_weekly_title: 'Weekly Report',
    mine_weekly_review: 'This Week',
    mine_weekly_suggest: 'Who to Reach Out',
    mine_weekly_todos: 'Pending Todos',
    mine_weekly_dates: 'Important Dates',
    mine_weekly_loading_ai: 'AI is analyzing…',
    mine_overdue: 'overdue',
    mine_today: 'today',
    mine_days_left: 'days left',
    mine_no_suggestions: 'No suggestions for now',
    detail_timeline: 'Timeline',
    tl_add: 'Add interaction',
    tl_edit: 'Edit',
    tl_delete: 'Delete',
    tl_save: 'Save',
    tl_cancel: 'Cancel',
    tl_summary_ph: 'What happened?',
    tl_date: 'Date',
    detail_leverage: 'Leverage',
    detail_nurture: 'Nurture',
    detail_dates: 'Important Dates',
    detail_memories: 'Memories',
    detail_presence: 'Presence Events',
    detail_tags: 'Tags',
    detail_goals: 'Goals',
    detail_how: 'How',
    detail_direction: 'Direction',
    detail_bond: 'Bond',
    detail_no_timeline: 'No interactions yet',
    detail_no_leverage: 'Not anchored yet',
    detail_no_nurture: 'No nurture info',
    detail_no_dates: 'No important dates',
    detail_no_memories: 'No memories',
    detail_no_presence: 'No presence events',
    detail_loading: 'Loading…',
    role_friend: 'As a Friend',
    role_family: 'As Family',
    role_collaborator: 'As a Collaborator',
    role_interactions: 'interactions',
    role_presence: 'presence events',
    role_todos_done: 'todos done',
    flywheel_title: 'Data Flywheel',
    flywheel_timeline: 'Timeline total',
    flywheel_coverage: 'Core interaction coverage',
    flywheel_this_week: 'This week goal',
    flywheel_items: 'items',
    // Contact edit
    edit_contact: 'Edit',
    delete_contact: 'Delete',
    save_contact: 'Save',
    cancel_edit: 'Cancel',
    confirm_delete: 'Delete this contact? All related timeline and todos will be removed.',
    edit_name: 'Name',
    edit_relation: 'Relation',
    edit_company: 'Company',
    edit_title: 'Title',
    edit_phone: 'Phone',
    edit_email: 'Email',
    edit_nature: 'Type',
    edit_nature_leverage: 'Leverage',
    edit_nature_nurture: 'Nurture',
    edit_nature_dual: 'Dual',
    edit_tags: 'Tags (comma separated)',
    edit_notes: 'Notes',
    edit_goals: 'Goals (comma separated)',
    edit_how: 'How',
    edit_bond: 'Bond',
    edit_dates: 'Important dates (date|label per line)',
    edit_memories: 'Memories (one per line)',
    // Export & delete account
    tab_settings: 'Settings',
    export_data: 'Export my data',
    export_desc: 'Download all your data as JSON',
    delete_account: 'Delete account',
    delete_account_desc: 'Permanently delete all your data. This cannot be undone.',
    confirm_delete_account: 'Are you absolutely sure? All contacts, timeline, todos, and billing data will be permanently deleted.',
    export_done: 'Data exported ✓',
    delete_done: 'Account deleted. Goodbye. ∞',
    // Monthly dashboard
    tab_monthly: 'Monthly',
    monthly_title: 'This Month',
    monthly_friend: 'As a Friend',
    monthly_family: 'As Family',
    monthly_collaborator: 'As a Collaborator',
    monthly_interactions: 'interactions',
    monthly_presence: 'presence events',
    monthly_todos_done: 'promises kept',
    monthly_no_data: 'No activity this month yet',
    monthly_upcoming: 'Upcoming',
    // Cooldown
    cooldown_warning: 'days since last contact',
    cooldown_urgent: 'Reach out soon',
    // Meeting prep
    meeting_prep: 'Meeting Prep',
    meeting_prep_title: 'Before you meet',
    meeting_prep_loading: 'Preparing…',
    meeting_last: 'Last conversation',
    meeting_todos: 'Pending todos',
    meeting_tips: 'Tips',
    // Model tier
    model_standard: 'Standard',
    model_enhanced: 'Enhanced',
    model_premium: 'Premium',
    model_cost_est: 'est.',
    // Cost preview
    cost_preview: 'Estimated cost',
    cost_points: 'points',
    // Contact grouping
    group_by: 'Group by',
    group_relation: 'Relation',
    group_company: 'Company',
    group_tag: 'Tag',
    group_strength: 'Strength',
    group_cooldown: 'Cooldown',
    group_other: 'Other',
    group_core: 'Core (4-5)',
    group_important: 'Important (3)',
    group_casual: 'Casual (1-2)',
    group_urgent: 'Needs attention',
    group_normal: 'In touch',
    group_recent: 'Recently contacted',
    group_never: 'Never contacted',
    group_unGrouped: 'Ungrouped',
    // Todos tab
    tab_todos: 'Todos',
    tab_timeline: 'Interactions',
    todo_title: 'Todos',
    todo_add: 'Add todo',
    todo_edit: 'Edit',
    todo_detail: 'Detail',
    todo_delete: 'Delete',
    todo_done: 'Done',
    todo_undone: 'Undo',
    todo_task: 'Task',
    todo_contact: 'Contact (optional)',
    todo_due: 'Due date (optional)',
    todo_priority: 'Priority',
    todo_save: 'Save',
    todo_cancel: 'Cancel',
    todo_empty: 'No todos yet',
    todo_confirm_delete: 'Delete this todo?',
    todo_overdue: 'overdue',
    todo_today: 'today',
    todo_days_left: 'd left',
    todo_filter_all: 'All',
    todo_filter_pending: 'Pending',
    todo_filter_done: 'Completed',
    todo_select_contact: 'Select contact',
    // Role play
    roleplay_btn: 'Role Play',
    roleplay_picker_title: '🎭 Choose a character to start',
    roleplay_intro: 'No login needed. Try Welian by role-playing a famous person — manage their relationships in conversation.',
    roleplay_howto: 'How it works',
    roleplay_step1: 'Pick a character and enter their social network',
    roleplay_step2: 'Chat naturally — log interactions, check todos, draft messages',
    roleplay_step3: 'Complete goals in the top-right panel',
    roleplay_step4: 'Finish all goals → earn a credit coupon → sign up to claim',
    roleplay_goals_count: 'goals · sequential timeline',
    roleplay_refresh: '🔄 Shuffle',
    roleplay_loading: 'Loading…',
    roleplay_load_fail: 'Failed to load: ',
    roleplay_exit: 'Exit role play → Sign up',
    roleplay_goal_done: '✅ **Goal completed: {title}**\n\n🔓 Next goal unlocked:\n\n**{next_title}**\n{next_desc}',
    roleplay_all_done: '🎉 Congratulations! You completed all goals!\n\n{avatar} {name} — every key relationship was well maintained.\n\n🎁 **You earned a credit coupon!**\n\n**Coupon code: `{code}`**\n\nThis gives you **{points} free credits** when you sign up.\n\n👉 Click "Exit role play" below to sign up and claim your reward.',
    roleplay_all_done_nonseq: '🎉 Congratulations! You completed all goals!\n\n{avatar} {name}\'s relationship network has improved.\n\n🎁 **You earned a credit coupon!**\n\n**Coupon code: `{code}`**\n\nThis gives you **{points} free credits** when you sign up.\n\n👉 Click "Exit role play" below to sign up and claim your reward.',
    roleplay_coupon_title: '🎁 You earned a coupon!',
    roleplay_coupon_code: 'Coupon code',
    roleplay_coupon_points: '{points} free credits',
    roleplay_coupon_hint: 'Sign up and enter this code to claim your credits.',
    roleplay_coupon_copy: 'Copy',
    roleplay_coupon_copied: 'Copied ✓',
    // Coupon redeem
    coupon_title: 'Redeem coupon',
    coupon_ph: 'Enter coupon code',
    coupon_redeem: 'Redeem',
    coupon_success: 'Redeemed! {points} credits added ✓',
    coupon_fail: 'Failed: ',
    coupon_invalid: 'Invalid or already used coupon',
  },
  zh: {
    tagline: '每段关系都值得<em>用心</em>',
    tagline_sub: '更好的朋友、更好的家人、更好的合作者',
    demo: '演示',
    welcome: '你好，我是小维 😊\n\n我帮你记住每段互动，提醒重要的时刻，帮你找到合适的话。\n\n登录后即可开始使用。',
    signin_prompt: '请先登录再开始聊天。🔑',
    input_ph: '跟 Welian 聊聊…',
    hint_reach: '该联系谁',
    hint_reach_desc: '看看谁值得主动联系',
    hint_overview: '联系人概览',
    hint_overview_desc: '了解你的关系网络',
    hint_note: '记一笔',
    hint_note_desc: '记录一次互动或会面',
    hint_draft: '拟条消息',
    hint_draft_desc: '帮你写一条合适的话',
    hint_review: '月度回顾',
    privacy: '你的数据留在你的设备上。',
    auth_title: '欢迎使用 Welian',
    auth_sub: '登录后开始管理你的关系',
    no_account: '没有账号？',
    sign_up_link: '注册',
    or: '或',
    wechat_login: '微信登录',
    phone_login: '手机号登录',
    sign_in: '登录',
    phone_title: '手机号登录',
    phone_ph: '请输入手机号',
    phone_send: '发送验证码',
    phone_sending: '发送中…',
    phone_code_ph: '请输入验证码',
    phone_verify: '验证并登录',
    phone_verifying: '验证中…',
    phone_sent: '验证码已发送',
    phone_err: '发送失败：',
    phone_err_code: '验证码错误或已过期',
    phone_err_phone: '请输入正确的手机号',
    phone_back: '返回',
    phone_countdown: 's 后重发',
    looking: '正在连接…',
    connecting: '连接中…',
    connected: "已连接 ✅\n\n你的数据在云端，我只看到你告诉我的。\n\n试试：\"该联系谁\" 或 \"记一下今天和X聊了Y\"",
    live_welcome: "Live 模式已连接 ✅\n\n我是小维，由 Devin 驱动。我可以自主读取联系人、拟写消息、管理待办，还能执行多步骤任务——写代码、浏览网页、调用工具，端到端帮你把事情做完。\n\n试试：\"该联系谁了？\" 或 \"记一下今天和X聊了Y\"",
    not_found: '未找到本地数据',
    not_found_desc: '你的关系数据留在你的电脑上。请在电脑上启动 Welian 来连接。',
    retry: '重试',
    cloud_status: '云端',
    cloud_welcome: "你好！我是小维 😊\n\n我可以帮你梳理关系、拟写消息、建议该联系谁。\n\n试试这些：\n• \"记一下今天和老王吃了饭\"\n• \"该联系谁了？\"\n• \"帮我给张总写条消息\"\n\n今天想聊什么？",
    cloud_error: '出错了：',
    live_upgraded: '本地 agent 已连接 ✅ 数据从你的设备同步。',
    live_available: '💡 检测到本地数据！刷新页面可启用完整功能。',
    billing_btn: '套餐',
    billing_title: '套餐与额度',
    billing_sub: '管理你的联点额度',
    billing_loading: '加载中…',
    billing_current: '当前套餐',
    billing_remaining: '剩余额度',
    billing_used: '本月已用',
    billing_allowance: '每月额度',
    billing_purchased: '已购联点',
    billing_reset: '每月自动刷新',
    billing_upgrade: '升级',
    billing_buy: '购买',
    billing_pro_monthly: 'Pro 月付',
    billing_pro_yearly: 'Pro 年付',
    billing_pack_100: '100 联点包',
    billing_pack_500: '500 联点包',
    billing_free: '免费版',
    billing_pro: 'Pro',
    billing_confirm_upgrade: '确认升级到',
    billing_confirm_buy: '确认购买',
    billing_success: '完成 ✓',
    billing_error: '操作失败：',
    billing_not_authed: '请先登录。',
    billing_history: '最近记录',
    billing_no_history: '暂无记录',
    pay_title: '微信支付',
    pay_scan: '用微信扫码支付',
    pay_amount: '金额',
    pay_done: '我已支付',
    pay_cancel: '取消',
    pay_pending: '正在确认支付…',
    pay_pending_sub: '我们会尽快确认您的付款',
    pay_confirmed: '支付成功 ✓',
    pay_failed: '未找到付款，请联系 contact@welian.app',
    mine_btn: '我的',
    support_btn: '支持',
    tab_overview: '概览',
    tab_contacts: '关系',
    tab_weekly: '周报',
    tab_billing: '套餐',
    mine_title: '我的',
    mine_loading: '加载中…',
    mine_empty: '暂无数据',
    mine_empty_contacts: '还没有联系人。和小维聊天开始记录互动吧。',
    mine_empty_todos: '暂无待办',
    mine_empty_timeline: '暂无互动记录',
    mine_overview_title: '本月的你',
    mine_contacts_total: '位联系人',
    mine_todos_pending: '条待办',
    mine_interactions: '本月互动',
    mine_leverage: '经营',
    mine_nurture: '陪伴',
    mine_dual: '双重',
    mine_last_contact: '上次联系',
    mine_no_date: '—',
    mine_search_ph: '搜索联系人…',
    mine_all: '全部',
    mine_weekly_title: '社交周报',
    mine_weekly_review: '本周回顾',
    mine_weekly_suggest: '该联系谁',
    mine_weekly_todos: '待办事项',
    mine_weekly_dates: '重要日期',
    mine_weekly_loading_ai: 'AI 正在分析…',
    mine_overdue: '超期',
    mine_today: '今天',
    mine_days_left: '天后',
    mine_no_suggestions: '暂无建议',
    detail_timeline: '互动记录',
    tl_add: '添加互动',
    tl_edit: '编辑',
    tl_delete: '删除',
    tl_save: '保存',
    tl_cancel: '取消',
    tl_summary_ph: '发生了什么？',
    tl_date: '日期',
    detail_leverage: '经营信息',
    detail_nurture: '陪伴信息',
    detail_dates: '重要日期',
    detail_memories: '记忆',
    detail_presence: '在场事件',
    detail_tags: '标签',
    detail_goals: '目标',
    detail_how: '经营方式',
    detail_direction: '方向',
    detail_bond: '关系纽带',
    detail_no_timeline: '暂无互动记录',
    detail_no_leverage: '尚未锚定',
    detail_no_nurture: '暂无陪伴信息',
    detail_no_dates: '暂无重要日期',
    detail_no_memories: '暂无记忆',
    detail_no_presence: '暂无在场事件',
    detail_loading: '加载中…',
    role_friend: '作为朋友',
    role_family: '作为家人',
    role_collaborator: '作为合作者',
    role_interactions: '次互动',
    role_presence: '次在场',
    role_todos_done: '件做到',
    flywheel_title: '数据飞轮',
    flywheel_timeline: '累计互动',
    flywheel_coverage: 'Core层覆盖率',
    flywheel_this_week: '本周记录目标',
    flywheel_items: '条',
    // Contact edit
    edit_contact: '编辑',
    delete_contact: '删除',
    save_contact: '保存',
    cancel_edit: '取消',
    confirm_delete: '确认删除此联系人？相关的互动记录和待办也会被删除。',
    edit_name: '姓名',
    edit_relation: '关系',
    edit_company: '公司',
    edit_title: '职位',
    edit_phone: '电话',
    edit_email: '邮箱',
    edit_nature: '类型',
    edit_nature_leverage: '经营',
    edit_nature_nurture: '陪伴',
    edit_nature_dual: '双重',
    edit_tags: '标签（逗号分隔）',
    edit_notes: '备注',
    edit_goals: '目标（逗号分隔）',
    edit_how: '经营方式',
    edit_bond: '关系纽带',
    edit_dates: '重要日期（每行 date|label）',
    edit_memories: '记忆（每行一条）',
    // Export & delete account
    tab_settings: '设置',
    export_data: '导出我的数据',
    export_desc: '下载所有数据为 JSON 文件',
    delete_account: '注销账户',
    delete_account_desc: '永久删除你的所有数据，不可恢复。',
    confirm_delete_account: '确定要注销吗？所有联系人、互动记录、待办和账单数据将被永久删除。',
    export_done: '数据已导出 ✓',
    delete_done: '账户已注销。再见。∞',
    // Monthly dashboard
    tab_monthly: '月度',
    monthly_title: '本月的你',
    monthly_friend: '作为朋友',
    monthly_family: '作为家人',
    monthly_collaborator: '作为合作者',
    monthly_interactions: '次互动',
    monthly_presence: '次在场',
    monthly_todos_done: '件做到',
    monthly_no_data: '本月还没有活动',
    monthly_upcoming: '即将到来',
    // Cooldown
    cooldown_warning: '天未联系',
    cooldown_urgent: '该联系了',
    // Meeting prep
    meeting_prep: '见面功课',
    meeting_prep_title: '见面前看看',
    meeting_prep_loading: '准备中…',
    meeting_last: '上次聊了什么',
    meeting_todos: '待办事项',
    meeting_tips: '建议',
    // Model tier
    model_standard: '标准',
    model_enhanced: '增强',
    model_premium: '最强',
    model_cost_est: '约',
    // Cost preview
    cost_preview: '预计消耗',
    cost_points: '联点',
    // Contact grouping
    group_by: '分组',
    group_relation: '关系',
    group_company: '公司',
    group_tag: '标签',
    group_strength: '亲密度',
    group_cooldown: '冷却状态',
    group_other: '其他',
    group_core: '核心 (4-5)',
    group_important: '重要 (3)',
    group_casual: '一般 (1-2)',
    group_urgent: '需要联系',
    group_normal: '保持中',
    group_recent: '近期已联系',
    group_never: '从未联系',
    group_unGrouped: '未分组',
    // Todos tab
    tab_todos: '待办',
    tab_timeline: '互动',
    todo_title: '待办事项',
    todo_add: '添加待办',
    todo_edit: '编辑',
    todo_detail: '详情',
    todo_delete: '删除',
    todo_done: '完成',
    todo_undone: '撤销',
    todo_task: '任务',
    todo_contact: '联系人（可选）',
    todo_due: '截止日期（可选）',
    todo_priority: '优先级',
    todo_save: '保存',
    todo_cancel: '取消',
    todo_empty: '暂无待办',
    todo_confirm_delete: '确认删除此待办？',
    todo_overdue: '已超期',
    todo_today: '今天',
    todo_days_left: '天后',
    todo_filter_all: '全部',
    todo_filter_pending: '待完成',
    todo_filter_done: '已完成',
    todo_select_contact: '选择联系人',
    // 角色扮演
    roleplay_btn: '角色扮演',
    roleplay_picker_title: '🎭 选择一个角色开始体验',
    roleplay_intro: '无需登录，立即体验 Welian 如何帮你管理社交关系。选择一个名人角色，在对话中维护他们的关系网络。',
    roleplay_howto: '怎么玩？',
    roleplay_step1: '选择一个角色，进入他们的社交网络',
    roleplay_step2: '像和助手聊天一样，用自然语言记录互动、查询待办、拟写消息',
    roleplay_step3: '完成右上角的目标',
    roleplay_step4: '完成所有目标 → 获得联点奖券 → 注册领取',
    roleplay_goals_count: '个目标 · 按时间线推进',
    roleplay_refresh: '🔄 换一批',
    roleplay_loading: '加载中…',
    roleplay_load_fail: '加载失败：',
    roleplay_exit: '退出角色扮演 → 注册真实账户',
    roleplay_goal_done: '✅ **目标完成：{title}**\n\n🔓 下一个目标已解锁：\n\n**{next_title}**\n{next_desc}',
    roleplay_all_done: '🎉 恭喜！你完成了所有目标！\n\n{avatar} {name} 的一生，每一段关键关系都得到了妥善维护。\n\n🎁 **你获得了一张联点奖券！**\n\n**奖券码：`{code}`**\n\n注册后可兑换 **{points} 联点**。\n\n👉 点击下方「退出角色扮演」注册账户并领取奖励。',
    roleplay_all_done_nonseq: '🎉 恭喜！你完成了所有目标！\n\n{avatar} {name} 的关系网络已经得到改善。\n\n🎁 **你获得了一张联点奖券！**\n\n**奖券码：`{code}`**\n\n注册后可兑换 **{points} 联点**。\n\n👉 点击下方「退出角色扮演」注册账户并领取奖励。',
    roleplay_coupon_title: '🎁 你获得了奖券！',
    roleplay_coupon_code: '奖券码',
    roleplay_coupon_points: '{points} 联点',
    roleplay_coupon_hint: '注册后输入此奖券码即可领取联点。',
    roleplay_coupon_copy: '复制',
    roleplay_coupon_copied: '已复制 ✓',
    // 奖券兑换
    coupon_title: '兑换奖券',
    coupon_ph: '请输入奖券码',
    coupon_redeem: '兑换',
    coupon_success: '兑换成功！已添加 {points} 联点 ✓',
    coupon_fail: '兑换失败：',
    coupon_invalid: '奖券码无效或已被使用',
  },
};

// ── CLI Login detection ──
export const cliCallback = new URLSearchParams(location.search).get('cli_callback');
export const wechatToken = new URLSearchParams(location.search).get('clerk_session_token');
if (wechatToken) {
  history.replaceState(null, '', location.pathname);
}
export const billingRedirect = new URLSearchParams(location.search).get('billing');
if (billingRedirect) {
  history.replaceState(null, '', location.pathname);
  window._pendingBillingOpen = true;
}

// ── State ──
export let isAuthed = false;
export let isLive = false;
export let isCloud = false;
export let clerkInstance = null;

// ── Routing config ──
export let routingConfig = { mode: 'auto', live_timeout_ms: 30000, agent_context_timeout_ms: 5000 };
export let dataPriority = ['cloud_kv', 'agent'];
export let clerkUserId = null;
export let clerkSessionToken = null;

export let isPageReload = (function() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) return nav.type === 'reload';
  } catch(e) {}
  try {
    return window.performance.navigation.type === 1;
  } catch(e) {}
  return false;
})();
console.log('[init] isPageReload=', isPageReload);

export let isCliLogin = false;
export let cliLoginInitialUserId = null;
export let existingUserId = null;
export let userInitiatedLogin = false;

// DOM elements
export const body = document.getElementById('chatBody');
export const input = document.getElementById('input');
export const modeBadge = document.getElementById('modeBadge');
export const navStatus = document.getElementById('navStatus');
export const statusDot = document.getElementById('statusDot');
export const statusText = document.getElementById('statusText');
export const authBtn = document.getElementById('authBtn');
export const welcomeState = document.getElementById('welcomeState');

export let clerkReady = false;
export let smsPhone = '';

// Bridge state
export let bridgeFrame = null;
export let bridgeReady = false;

// Chat state
export let conversationHistory = [];
export let chatAbortController = null;
export let currentSessionId = null;
export let sessionList = [];

// System prompt cache
export let cachedSystemPrompt = '';
export let cachedUserProfile = '';
export let cachedUserProfileObj = null;

// Simulation mode
export let simulationMode = false;
export let simulationPersona = null;
export let simulationData = null;
export let simulationGoals = [];

export const SCENARIO_IDS = ['jobs', 'musk', 'zhang', 'obama', 'renzhengfei', 'leijun', 'wangxing', 'caodewang', 'dongmingzhu', 'buffett', 'bezos', 'gates', 'zhouxingchi', 'lian', 'maotai', 'yanglan', 'maotai2', 'yuminhong', 'huangzheng', 'lishufu', 'inamori', 'oprah', 'wangshi', 'zongqinghou', 'zhongshanshan', 'sandberg', 'zhangruimin'];

// Chat file upload
export let pendingChatFile = null;

// Chat data cache
export let chatDataCache = { contacts: [], todos: [], timeline: [] };

// Proactive suggestions
export let proactiveSuggestions = [];
export let proactiveFetchId = 0;

// Weather
export let weatherCache = null;

// Warmth quotes
export const WARMTH_QUOTES_ZH = [
  '「关系的温度，不在于频率，而在于用心。」',
  '「你不需要记住所有事，只需要记住那些重要的人。」',
  '「最好的社交，是让每个人都被看见。」',
  '「联系不是任务，是心意的流动。」',
  '「一段好的关系，是两个人都愿意为对方多想一步。」',
  '「不是关系淡了，是你忘了浇水。」',
  '「记住一个人的生日，比记住一百条道理更有用。」',
  '「关系像植物，不需要每天浇水，但不能忘了。」',
];
export const WARMTH_QUOTES_EN = [
  '"The warmth of a relationship is not in frequency, but in sincerity."',
  '"You don\'t need to remember everything, just the people who matter."',
  '"The best social skill is making everyone feel seen."',
  '"Reaching out isn\'t a task — it\'s the flow of care."',
  '"A good relationship is when both people think one step ahead for each other."',
  '"Relationships don\'t fade — you just forgot to water them."',
  '"Remembering a birthday is worth more than a hundred principles."',
  '"Relationships are like plants — not daily watering, but never forgetting."',
];

// Voice input
export let voiceRecognition = null;
export let isRecording = false;

// Mine panel
export let mineCurrentTab = 'overview';
export let mineCache = {};

// Contacts
export let contactsGroupBy = 'relation';
export let contactsCollapsedGroups = new Set();
export let currentContactsFilter = 'all';

// Billing
export let PAY_AMOUNTS = {};
export let currentOrder = null;

// Model tier
export let currentModelTier = localStorage.getItem('welian_model_tier') || 'standard';
export const MODEL_TIERS = {
  standard: { multiplier: 1, label: { en: 'Standard', zh: '标准' } },
  enhanced: { multiplier: 3, label: { en: 'Enhanced', zh: '增强' } },
  premium:  { multiplier: 10, label: { en: 'Premium', zh: '最强' } },
};

// Timeline
export let timelineFilter = 'all';
export let timelineSearchQuery = '';
export let timelineCache = [];

// Todos
export let todosFilter = 'pending';
export let todosDoneCache = [];
export let todosCache = [];

// Onboarding
export let onboardingExtractedContacts = [];

// PDF sandbox URL
export const PDF_SANDBOX_URL = (() => {
  if (window.WELIAN_PDF_URL) return window.WELIAN_PDF_URL;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:8198';
  return 'https://pdf.welian.app';
})();

// ── Language ──
export let currentLang = localStorage.getItem('welian_lang') || 'zh';

// ── Setter functions for state modification from other modules ──
export function setCurrentLang(lang) { currentLang = lang; }
export function setIsAuthed(v) { isAuthed = v; }
export function setIsLive(v) { isLive = v; }
export function setIsCloud(v) { isCloud = v; }
export function setClerkInstance(v) { clerkInstance = v; }
export function setRoutingConfig(v) { routingConfig = v; }
export function setDataPriority(v) { dataPriority = v; }
export function setClerkUserId(v) { clerkUserId = v; }
export function setClerkSessionToken(v) { clerkSessionToken = v; }
export function setIsCliLogin(v) { isCliLogin = v; }
export function setCliLoginInitialUserId(v) { cliLoginInitialUserId = v; }
export function setExistingUserId(v) { existingUserId = v; }
export function setUserInitiatedLogin(v) { userInitiatedLogin = v; }
export function setClerkReady(v) { clerkReady = v; }
export function setSmsPhone(v) { smsPhone = v; }
export function setBridgeFrame(v) { bridgeFrame = v; }
export function setBridgeReady(v) { bridgeReady = v; }
export function setConversationHistory(v) { conversationHistory = v; }
export function setChatAbortController(v) { chatAbortController = v; }
export function setCurrentSessionId(v) { currentSessionId = v; }
export function setSessionList(v) { sessionList = v; }
export function setCachedSystemPrompt(v) { cachedSystemPrompt = v; }
export function setCachedUserProfile(v) { cachedUserProfile = v; }
export function setCachedUserProfileObj(v) { cachedUserProfileObj = v; }
export function setSimulationMode(v) { simulationMode = v; }
export function setSimulationPersona(v) { simulationPersona = v; }
export function setSimulationData(v) { simulationData = v; }
export function setSimulationGoals(v) { simulationGoals = v; }
export function setPendingChatFile(v) { pendingChatFile = v; }
export function setChatDataCache(v) { chatDataCache = v; }
export function setProactiveSuggestions(v) { proactiveSuggestions = v; }
export function setProactiveFetchId(v) { proactiveFetchId = v; }
export function setWeatherCache(v) { weatherCache = v; }
export function setVoiceRecognition(v) { voiceRecognition = v; }
export function setIsRecording(v) { isRecording = v; }
export function setMineCurrentTab(v) { mineCurrentTab = v; }
export function setMineCache(v) { mineCache = v; }
export function setContactsGroupBy(v) { contactsGroupBy = v; }
export function setContactsCollapsedGroups(v) { contactsCollapsedGroups = v; }
export function setCurrentContactsFilter(v) { currentContactsFilter = v; }
export function setPAY_AMOUNTS(v) { PAY_AMOUNTS = v; }
export function setCurrentOrder(v) { currentOrder = v; }
export function setCurrentModelTier(v) { currentModelTier = v; }
export function setTimelineFilter(v) { timelineFilter = v; }
export function setTimelineSearchQuery(v) { timelineSearchQuery = v; }
export function setTimelineCache(v) { timelineCache = v; }
export function setTodosFilter(v) { todosFilter = v; }
export function setTodosDoneCache(v) { todosDoneCache = v; }
export function setTodosCache(v) { todosCache = v; }
export function setOnboardingExtractedContacts(v) { onboardingExtractedContacts = v; }
