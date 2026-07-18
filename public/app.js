// ── Config ──
const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsud2VsaWFuLmFwcCQ';
const DISCOVERY_URL = 'https://welian-ai.farmost.workers.dev';
const AGENT_TUNNEL_URL = 'https://agent.welian.app';  // Direct tunnel (no discovery needed)
const CLOUD_URL = 'https://api.welian.app';  // Cloud AI gateway (方案C)

// ── i18n ──
const I18N = {
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

let currentLang = localStorage.getItem('welian_lang') || 'zh';

function applyLang(lang) {
  currentLang = lang;
  localStorage.setItem('welian_lang', lang);
  const dict = I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.innerHTML = dict[key];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (dict[key]) el.placeholder = dict[key];
  });
  document.getElementById('langBtn').textContent = lang === 'en' ? '中文' : 'EN';
  document.getElementById('authBtn').textContent = isAuthed ? authBtn.textContent : dict.sign_in;
}

function toggleLang() {
  applyLang(currentLang === 'en' ? 'zh' : 'en');
}

// ── CLI Login detection (welian.app?cli_callback=http://localhost:9876) ──
// If cli_callback param is present, redirect user_id back to CLI after Clerk auth
// Don't replace body — let normal sign-in UI show, onAuthed handles redirect
const cliCallback = new URLSearchParams(location.search).get('cli_callback');

// ── WeChat session token detection (return from WeChat OAuth) ──
const wechatToken = new URLSearchParams(location.search).get('clerk_session_token');
if (wechatToken) {
  // Clean URL and set session
  history.replaceState(null, '', location.pathname);
}

// ── Paddle checkout success redirect ──
const billingRedirect = new URLSearchParams(location.search).get('billing');
if (billingRedirect) {
  history.replaceState(null, '', location.pathname);
  // Auto-open billing tab after auth completes
  window._pendingBillingOpen = true;
}

// ── Main app (below) ──

// ── State ──
let isAuthed = false;   // Clerk auth state
let isLive = false;     // Connected to local agent (Live mode)
let isCloud = false;    // Cloud direct mode (no local agent)
let clerkInstance = null;

// ── Routing config (fetched from /ai/config) ──
let routingConfig = { mode: 'auto', live_timeout_ms: 30000, agent_context_timeout_ms: 5000 };
let dataPriority = ['cloud_kv', 'agent'];  // data source priority (cloud mode)
let clerkUserId = null; // Clerk user ID for device discovery
let clerkSessionToken = null; // Clerk session JWT for API auth
// Detect page reload (support both modern and legacy APIs)
let isPageReload = (function() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) return nav.type === 'reload';
  } catch(e) {}
  try {
    return window.performance.navigation.type === 1; // 1 = TYPE_RELOAD
  } catch(e) {}
  return false;
})();
console.log('[init] isPageReload=', isPageReload);

// Get fresh Clerk session token (JWT expires, so fetch each time)
async function getClerkToken() {
  try {
    if (window.Clerk) {
      // Try to get session — Clerk may need to refresh
      const session = window.Clerk.session || (window.Clerk.user?.sessions?.find(s => s.status === 'active'));
      if (session) {
        const token = await session.getToken();
        return token;
      }
    }
  } catch (e) {
    console.log('[getClerkToken] failed:', e.message);
  }
  return null;
}
let isCliLogin = false; // CLI login mode — wait for explicit sign-in
let cliLoginInitialUserId = null; // existing user ID to ignore
let existingUserId = null; // pre-existing session to ignore (no auto-login)
let userInitiatedLogin = false; // set true when user clicks Sign in

// Global listener for device-id from bridge (survives after tryBridgeConnect handler is removed)
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.source !== 'welian-bridge') return;
  if (msg.type === 'device-id' && msg.device_id) {
    console.log('Bridge device_id:', msg.device_id);
    // Agent already registered tunnel with user_id via CLI login — no linking needed
  }
});

const body = document.getElementById('chatBody');
const input = document.getElementById('input');
const modeBadge = document.getElementById('modeBadge'); // null (removed from UI)

// ── Local date helper (toISOString returns UTC, not local time) ──
function localDateStr(d) {
  d = d || new Date();
  const offset = d.getTimezoneOffset(); // minutes behind UTC
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}
const navStatus = document.getElementById('navStatus');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const authBtn = document.getElementById('authBtn');
const welcomeState = document.getElementById('welcomeState');

// ── Nav scroll effect ──
// Listen to main scroll container (not window, since layout changed to flex)
const _mainEl = document.getElementById('chatMain');
const _scrollEl = _mainEl ? _mainEl.querySelector('main') : null;
if (_scrollEl) {
  _scrollEl.addEventListener('scroll', () => {
    document.getElementById('nav').classList.toggle('scrolled', _scrollEl.scrollTop > 4);
  });
} else {
  window.addEventListener('scroll', () => {
    document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 4);
  });
}

// ── Clerk init ──
let clerkReady = false;

async function initClerk() {
  if (!CLERK_PUBLISHABLE_KEY) {
    console.log('Clerk not configured — running in demo mode');
    return;
  }

  try {
    // Wait for Clerk CDN script to load and auto-init
    // The CDN script with data-clerk-publishable-key auto-initializes window.Clerk
    let attempts = 0;
    while (typeof window.Clerk === 'undefined' && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (typeof window.Clerk === 'undefined') {
      console.error('Clerk CDN script failed to load');
      return;
    }

    console.log('Clerk global available, waiting for load...');
    clerkInstance = window.Clerk;

    // Load UI bundle BEFORE clerkInstance.load() — Clerk JS v6 requires
    // the UI constructor to be passed in load() options for mountSignIn to work
    await loadClerkUI(CLERK_PUBLISHABLE_KEY);
    console.log('UI bundle loaded, ClerkUICtor:', typeof window.__internal_ClerkUICtor);

    // Wait for Clerk to be loaded, passing the UI constructor
    if (!clerkInstance.loaded) {
      const loadOpts = {};
      if (window.__internal_ClerkUICtor) {
        loadOpts.ui = { ClerkUI: window.__internal_ClerkUICtor };
      }
      await clerkInstance.load(loadOpts);
    }
    console.log('Clerk loaded, status:', clerkInstance.status);

    clerkReady = true;

    // Check if user initiated login in this browser session (survives page reload)
    const loginInitiated = sessionStorage.getItem('welian_login_initiated') === '1';
    if (loginInitiated) {
      console.log('Login was initiated this session — accepting session');
    }

    // Record existing session to ignore it (no auto-login) unless login was initiated
    existingUserId = clerkInstance.user ? clerkInstance.user.id : null;
    if (existingUserId && !loginInitiated) {
      console.log('Existing Clerk session found, will ignore (no auto-login):', existingUserId);
    }

    // Set CLI login mode
    if (cliCallback) {
      isCliLogin = true;
      cliLoginInitialUserId = existingUserId;
      console.log('CLI login: initial user:', cliLoginInitialUserId);
    }

    // Handle WeChat OAuth return: set session from token
    if (wechatToken) {
      try {
        console.log('Setting WeChat session token…');
        await clerkInstance.setActive({ session: wechatToken });
        console.log('WeChat session set, reloading…');
      } catch(e) {
        console.error('WeChat session set failed:', e);
        addSystemMsg('微信登录失败：' + e.message);
      }
    }

    // Listen for auth state changes
    // Auto-login if there's an existing valid session
    clerkInstance.addListener((event) => {
      console.log('Clerk event:', Object.keys(event), 'user:', !!event.user, 'isAuthed:', isAuthed);
      if (event.user && !isAuthed) {
        if (isCliLogin && event.user.id === cliLoginInitialUserId) {
          console.log('CLI login: ignoring existing session for', event.user.id);
          return;
        }
        isCliLogin = false;
        userInitiatedLogin = false;
        sessionStorage.removeItem('welian_login_initiated');
        onAuthed(event.user);
      } else if (!event.user && isAuthed) {
        sessionStorage.removeItem('welian_login_initiated');
        onSignedOut();
      }
    });

    // CLI login flow: show sign-in form immediately
    if (cliCallback) {
      console.log('CLI login: showing form, initial user:', cliLoginInitialUserId);
      document.getElementById('clerk-auth').classList.add('show');
      const container = document.getElementById('clerk-container');

      if (cliLoginInitialUserId) {
        container.innerHTML = '<div style="text-align:center;padding:8px 0 12px;font-size:.8em;color:var(--dim)">当前账号: ' + cliLoginInitialUserId.slice(-8) + '<br>请用其他账号登录，或关闭此页保持当前账号</div>';
        const formDiv = document.createElement('div');
        container.appendChild(formDiv);
        clerkInstance.mountSignIn(formDiv);
      } else {
        mountClerkSignIn(container);
      }
      console.log('CLI login: sign-in form shown, waiting for new login');
    }
    // No auto-login: user must click "Sign in" manually
  } catch(e) {
    console.error('Clerk init failed:', e);
    clerkReady = false;
  }
}

function wechatLogin() {
  // Redirect to Worker's WeChat OAuth endpoint
  // Worker will redirect to WeChat, then back with session token
  const redirect = encodeURIComponent(location.origin + location.pathname);
  window.location.href = `${DISCOVERY_URL}/auth/wechat?redirect=${redirect}`;
}

// ── Phone SMS login ──

function showPhoneLogin() {
  const d = I18N[currentLang];
  // Replace auth card content with phone login form
  const card = document.querySelector('#clerk-auth .card');
  card.innerHTML = `
    <button class="close" onclick="toggleAuth()">×</button>
    <h2>${d.phone_title}</h2>
    <div id="phone-login-form" style="margin-top:16px">
      <input id="phone-input" type="tel" placeholder="${d.phone_ph}" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:.95em;margin-bottom:10px;box-sizing:border-box" autocomplete="off">
      <button id="phone-send-btn" onclick="sendSMS()" style="width:100%;padding:10px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.9em;cursor:pointer">${d.phone_send}</button>
      <div id="phone-msg" style="font-size:.8em;margin-top:8px;min-height:1em"></div>
    </div>
    <div id="phone-verify-form" style="display:none;margin-top:16px">
      <input id="phone-code-input" type="text" placeholder="${d.phone_code_ph}" maxlength="6" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:1.1em;letter-spacing:4px;margin-bottom:10px;box-sizing:border-box;text-align:center" autocomplete="off">
      <button id="phone-verify-btn" onclick="verifySMS()" style="width:100%;padding:10px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.9em;cursor:pointer;margin-bottom:8px">${d.phone_verify}</button>
      <button onclick="showPhoneLogin()" style="width:100%;padding:8px;background:none;border:none;color:var(--dim);font-size:.85em;cursor:pointer">${d.phone_back}</button>
    </div>
  `;
}

let smsPhone = '';

async function sendSMS() {
  const d = I18N[currentLang];
  const phone = document.getElementById('phone-input').value.trim();
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    document.getElementById('phone-msg').textContent = d.phone_err_phone;
    document.getElementById('phone-msg').style.color = '#C65D5D';
    return;
  }
  smsPhone = phone;
  const btn = document.getElementById('phone-send-btn');
  btn.disabled = true;
  btn.textContent = d.phone_sending;

  try {
    const resp = await fetch(`${DISCOVERY_URL}/auth/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await resp.json();
    if (data.ok) {
      document.getElementById('phone-msg').textContent = d.phone_sent;
      document.getElementById('phone-msg').style.color = '#4a9';
      // Show verify form
      document.getElementById('phone-login-form').style.display = 'none';
      document.getElementById('phone-verify-form').style.display = 'block';
      document.getElementById('phone-code-input').focus();
      // Countdown
      let count = 60;
      btn.textContent = count + d.phone_countdown;
      const timer = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = d.phone_send;
        } else {
          btn.textContent = count + d.phone_countdown;
        }
      }, 1000);
    } else {
      btn.disabled = false;
      btn.textContent = d.phone_send;
      document.getElementById('phone-msg').textContent = d.phone_err + (data.error || '');
      document.getElementById('phone-msg').style.color = '#C65D5D';
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = d.phone_send;
    document.getElementById('phone-msg').textContent = d.phone_err + e.message;
    document.getElementById('phone-msg').style.color = '#C65D5D';
  }
}

async function verifySMS() {
  const d = I18N[currentLang];
  const code = document.getElementById('phone-code-input').value.trim();
  if (!code || code.length !== 6) {
    return;
  }
  const btn = document.getElementById('phone-verify-btn');
  btn.disabled = true;
  btn.textContent = d.phone_verifying;

  try {
    const resp = await fetch(`${DISCOVERY_URL}/auth/sms/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: smsPhone, code }),
    });
    const data = await resp.json();
    if (data.ok && data.jwt) {
      // Set Clerk session
      if (clerkInstance) {
        await clerkInstance.setActive({ session: data.jwt });
      }
      // Close modal — onAuthed will fire from Clerk listener
      document.getElementById('clerk-auth').classList.remove('show');
    } else {
      btn.disabled = false;
      btn.textContent = d.phone_verify;
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:.8em;color:#C65D5D;margin-top:8px';
      msg.textContent = data.error || d.phone_err_code;
      document.getElementById('phone-verify-form').appendChild(msg);
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = d.phone_verify;
  }
}

function closeAuth() {
  document.getElementById('clerk-auth').classList.remove('show');
  userInitiatedLogin = false;
  sessionStorage.removeItem('welian_login_initiated');
}

function toggleAuth(mode) {
  if (isAuthed) {
    // Sign out
    if (clerkInstance) clerkInstance.signOut();
    onSignedOut();
    return;
  }
  // User manually initiated login — accept the next auth event
  userInitiatedLogin = true;
  sessionStorage.setItem('welian_login_initiated', '1');
  // Show auth modal
  document.getElementById('clerk-auth').classList.add('show');

  const mountFn = mode === 'signup' ? mountClerkSignUp : mountClerkSignIn;

  // Re-mount Clerk (clear previous mount first)
  const container = document.getElementById('clerk-container');
  container.innerHTML = '';
  if (!clerkReady || !clerkInstance) {
    container.innerHTML = '<p style="text-align:center;color:var(--dim);padding:12px;font-size:.8em">加载中…</p>';
    const wait = setInterval(() => {
      if (clerkReady && clerkInstance) {
        clearInterval(wait);
        mountFn(container);
      }
    }, 500);
    setTimeout(() => clearInterval(wait), 10000);
    return;
  }
  mountFn(container);
}

function mountClerkSignIn(container) {
  try {
    container.innerHTML = '';
    const freshDiv = document.createElement('div');
    container.appendChild(freshDiv);
    clerkInstance.mountSignIn(freshDiv, {
      initialValues: { identifier: '' },
      appearance: {
        elements: {
          socialButtonsBlockButton: { order: '10' },
          socialButtonsBlockButton__google: { order: '11' },
          socialButtonsBlockButton__apple: { order: '12' },
          socialButtonsBlockButton__wechat: { order: '13' },
          formFieldIdentifier: { order: '1' },
          formButtonPrimary: { order: '2' },
        },
      },
    });
    console.log('mountSignIn called with email-first layout');
  } catch(e) {
    console.error('mountSignIn failed:', e);
    container.innerHTML = '<p style="color:#C65D5D;text-align:center;padding:20px">Failed to load sign-in form.<br><small>' + e.message + '</small></p>';
  }
}

function mountClerkSignUp(container) {
  container = container || document.getElementById('clerk-container');
  try {
    container.innerHTML = '';
    const freshDiv = document.createElement('div');
    container.appendChild(freshDiv);
    clerkInstance.mountSignUp(freshDiv, {
      appearance: {
        elements: {
          socialButtonsBlockButton: { order: '10' },
          socialButtonsBlockButton__google: { order: '11' },
          socialButtonsBlockButton__apple: { order: '12' },
          socialButtonsBlockButton__wechat: { order: '13' },
          formFieldEmail: { order: '1' },
          formButtonPrimary: { order: '5' },
        },
      },
    });
    console.log('mountSignUp called with email-first layout');
  } catch(e) {
    console.error('mountSignUp failed:', e);
    container.innerHTML = '<p style="color:#C65D5D;text-align:center;padding:20px">Failed to load sign-up form.<br><small>' + e.message + '</small></p>';
  }
}

function onAuthed(user) {
  console.log('[onAuthed] called, isPageReload=', isPageReload, 'savedTab=', localStorage.getItem('welian_mine_tab'));
  isAuthed = true;
  clerkUserId = user.id || null;

  // Build display name: prefer firstName, then username, then email, then phone, then user_id
  const email = user.primaryEmailAddress?.emailAddress || '';
  const phone = user.primaryPhoneNumber?.phoneNumber || '';
  const displayName = user.firstName || user.username || email || phone || clerkUserId.slice(-8);
  authBtn.textContent = displayName;
  // Tooltip with full identity info
  const tipParts = [`User ID: ${clerkUserId}`];
  if (email) tipParts.push(`Email: ${email}`);
  if (phone) tipParts.push(`Phone: ${phone}`);
  if (user.firstName) tipParts.push(`Name: ${user.firstName}`);
  authBtn.title = tipParts.join('\n');

  navStatus.style.display = 'inline-flex';
  document.getElementById('billingBtn').style.display = 'inline-block';
  // Load session list (sidebar shows on hover, no need to force open)
  loadSessionList();
  // Close auth modal if open
  document.getElementById('clerk-auth').classList.remove('show');

  // CLI login flow: redirect user_id back to CLI callback
  if (cliCallback && clerkUserId) {
    window.location.href = cliCallback + '?user_id=' + encodeURIComponent(clerkUserId);
    return;
  }

  // Auto-connect to local agent (no token needed)
  autoConnectAgent();

  // Check if onboarding needed (new user with no contacts)
  checkOnboardingNeeded();

  // Load chat-page enhancements (dashboard, quick actions, sidebar, badges, reminder)
  loadChatEnhancements();

  // Paddle checkout success: auto-open billing tab
  if (window._pendingBillingOpen) {
    window._pendingBillingOpen = false;
    localStorage.setItem('welian_mine_tab', 'billing');
    sessionStorage.setItem('welian_mine_open', '1');
    setTimeout(() => openMine(), 800);
  } else if (sessionStorage.getItem('welian_mine_open') === '1') {
    // Auto-restore mine panel only if it was open before refresh (same tab session)
    const savedTab = localStorage.getItem('welian_mine_tab');
    if (savedTab) {
      setTimeout(() => openMine(), 300);
    }
  }
}

function onSignedOut() {
  isAuthed = false;
  isLive = false;
  isCloud = false;
  conversationHistory = [];
  removeBridge();
  authBtn.textContent = I18N[currentLang].sign_in;
  navStatus.style.display = 'none';
  document.getElementById('billingBtn').style.display = 'none';
  closeSidebar(); // H4: close sidebar on logout
  if (modeBadge) { modeBadge.textContent = ''; modeBadge.className = 'mode-badge'; }
  clearChat();
  showWelcome();
}

// ── Auto-connect to local agent ──
// Agent injects pairing token into bridge HTML, so no manual token entry needed.
// We just embed the iframe and wait for auth_ok.

let bridgeFrame = null;
let bridgeReady = false;

function removeBridge() {
  if (bridgeFrame) {
    bridgeFrame.remove();
    bridgeFrame = null;
    bridgeReady = false;
  }
}

// ── Cloud direct mode (方案C) ──
// When no local agent is found, fall back to cloud AI gateway.
// User can chat immediately without installing CLI.
// No local data (contacts/todos) — AI is a generic relationship assistant.

async function enableCloudMode() {
  isCloud = true;
  isLive = false;
  statusDot.className = 'status-dot online';
  statusText.textContent = I18N[currentLang].cloud_status;
  if (modeBadge) { modeBadge.textContent = 'Cloud'; modeBadge.className = 'mode-badge live'; }

  clearChat();
  // Retry token a few times — Clerk session may still be initializing
  let token = null;
  for (let i = 0; i < 3 && !token; i++) {
    token = await getClerkToken();
    if (!token) await new Promise(r => setTimeout(r, 500));
  }
  if (token) {
    try {
      const resp = await fetch(`${CLOUD_URL}/data/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const sessions = data.sessions || [];
        if (sessions.length > 0) {
          const lastSession = sessions[0]; // most recent (already reversed)
          const lastDate = lastSession.updated_at ? new Date(lastSession.updated_at) : null;
          const today = new Date();
          const isSameDay = lastDate && lastDate.getFullYear() === today.getFullYear()
            && lastDate.getMonth() === today.getMonth()
            && lastDate.getDate() === today.getDate();
          if (isSameDay) {
            // Continue today's session
            await loadSession(lastSession.id);
          } else {
            // New day — start fresh, show summary of last session as welcome
            currentSessionId = null;
            conversationHistory = [];
            const summary = await generateSessionSummary(lastSession.id, token);
            const zh = currentLang === 'zh';
            const welcome = zh
              ? `早上好 ☀️\n\n上次我们聊了：${summary}\n\n今天想聊什么？`
              : `Good morning ☀️\n\nLast time we talked about: ${summary}\n\nWhat's on your mind today?`;
            addMsg('ai', welcome);
          }
          return;
        }
      }
    } catch (e) { /* fall through to welcome */ }
  }
  // No previous sessions or token unavailable — show welcome
  addMsg('ai', I18N[currentLang].cloud_welcome);
}

// Fetch last session and generate LLM summary
async function generateSessionSummary(sessionId, token) {
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/session_summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, session_id: sessionId }),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return data.summary || '';
  } catch { return ''; }
}

// Get or set agent config (engine, devin params) via bridge
async function agentConfig(action, config) {
  if (!bridgeFrame || !bridgeReady) return null;
  return new Promise((resolve) => {
    const reqId = 'agcfg_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response') {
          resolve(msg.data);
        } else if (msg.data.type === 'error') {
          resolve({ error: true, message: msg.data.message || 'Unknown error' });
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 5000);

    const payload = { cmd: 'agent_config', id: reqId, action };
    if (config) payload.config = config;
    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload
    }, '*');
  });
}

// Direct Devin CLI passthrough — no Welian context, pure Devin
async function devinDirect(text) {
  if (!bridgeFrame || !bridgeReady) return null;
  console.log('[devinDirect] Sending to Devin CLI:', text.substring(0, 80));
  return new Promise((resolve) => {
    const reqId = 'devin_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.reply) {
          resolve(msg.data.reply);
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    // Timeout: Devin CLI can take a while, use 10 min
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log('[devinDirect] TIMEOUT');
        resolve(null);
      }
    }, 600000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'devin_direct', id: reqId, text: text }
    }, '*');
  });
}

// Send chat through local agent (Devin CLI) — uses local LLM, no cloud token cost
// Supports streaming: if agent sends {type:'stream'} chunks, they're displayed in real-time
async function agentChat(text, timeoutMs, attachedFile) {
  if (!bridgeFrame || !bridgeReady) return null;
  console.log('[agentChat] Sending via bridge:', text.substring(0, 50), attachedFile ? 'with file' : '');
  return new Promise((resolve) => {
    const reqId = 'chat_' + Date.now();
    let resolved = false;
    let streamBuffer = '';

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        // Stream chunk — append to buffer and update typing indicator
        if (msg.data.type === 'stream' && msg.data.chunk) {
          streamBuffer += msg.data.chunk;
          // Update typing indicator with streaming content
          const typingEl = document.getElementById('typing');
          if (typingEl) {
            const bubble = typingEl.querySelector('.bubble');
            if (bubble) {
              bubble.style.whiteSpace = 'pre-wrap';
              bubble.textContent = streamBuffer;
              // Auto-scroll
              const chatBody = document.getElementById('chatMessages') || typingEl.parentElement;
              if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
            }
          }
          return;  // don't resolve, wait for final response
        }
        // Final response
        if (msg.data.type === 'response' && msg.data.reply) {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(msg.data.reply);
        } else if (msg.data.type === 'error') {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    // Timeout: configurable via routingConfig.live_timeout_ms (default 30s)
    const timeout = timeoutMs || routingConfig.live_timeout_ms || 30000;
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(`[agentChat] TIMEOUT — agent did not respond in ${timeout}ms`);
        resolve(null);
      }
    }, timeout);

    const payload = { cmd: 'chat', id: reqId, text: text };
    if (attachedFile && attachedFile.base64) {
      payload.file = {
        base64: attachedFile.base64,
        filename: attachedFile.filename,
        media_type: attachedFile.mediaType,
        is_image: attachedFile.isImage,
      };
    }
    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: payload
    }, '*');
  });
}

async function getAgentContext(text) {
  // Ask local agent for edge data context (contacts, todos, activities)
  // Returns {data_context, conversation} or null if agent unavailable
  if (!bridgeFrame || !bridgeReady) {
    console.log('[getAgentContext] No bridge available');
    return null;
  }
  console.log('[getAgentContext] Requesting context for:', text.substring(0, 50));
  return new Promise((resolve) => {
    const reqId = 'ctx_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log('[getAgentContext] Got response:', msg.data.type, 'has data:', !!msg.data.data);
        if (msg.data.type === 'response' && msg.data.data) {
          console.log('[getAgentContext] data_context length:', (msg.data.data.data_context || '').length);
          resolve(msg.data.data);
        } else {
          console.log('[getAgentContext] No data in response');
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    // Timeout: configurable via routingConfig.agent_context_timeout_ms (default 5s)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(`[getAgentContext] TIMEOUT — agent did not respond in ${routingConfig.agent_context_timeout_ms}ms`);
        resolve(null);
      }
    }, routingConfig.agent_context_timeout_ms || 5000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'context', id: reqId, text: text }
    }, '*');
  });
}

function saveAgentTurn(text, reply) {
  // Tell agent to save conversation turn (for multi-turn context)
  if (!bridgeFrame || !bridgeReady) return;
  const reqId = 'save_' + Date.now();
  bridgeFrame.contentWindow.postMessage({
    source: 'welian-parent',
    type: 'send',
    payload: { cmd: 'save_turn', id: reqId, text: text, reply: reply }
  }, '*');
}

async function getCloudDataContext() {
  // Fetch data context from cloud KV (synced by agent)
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return '';
  try {
    const resp = await fetch(`${CLOUD_URL}/data/context`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return data.data_context || '';
  } catch (e) {
    console.log('[getCloudDataContext] failed:', e.message);
    return '';
  }
}

async function cloudSearch(keywords, contactName) {
  // Search contacts in cloud KV (full cloud mode, no agent needed)
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return null;
  try {
    const resp = await fetch(`${CLOUD_URL}/data/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        session_token: token,
        keywords: keywords,
        contact_name: contactName,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    console.log('[cloudSearch] matched:', data.matched_count, 'data_context len:', (data.data_context||'').length);
    return data;
  } catch (e) {
    console.log('[cloudSearch] failed:', e.message);
    return null;
  }
}

// ── Cloud-native list helpers (full cloud mode, no agent needed) ──

async function cloudListTodos() {
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return '';
  try {
    const resp = await fetch(`${CLOUD_URL}/data/todos`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const todos = data.todos || [];
    if (todos.length === 0) return '待办：暂无记录';
    const today = localDateStr();
    const lines = [`【待办】共 ${todos.length} 条`];
    for (const t of todos) {
      const due = (t.due || '').substring(0, 10);
      const task = (t.task || '').substring(0, 80);
      const contact = t.contact || '';
      if (due) {
        const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
        if (delta < 0) lines.push(`  · [${contact}] ${task}（超期${-delta}天）`);
        else if (delta === 0) lines.push(`  · [${contact}] ${task}（今天）`);
        else lines.push(`  · [${contact}] ${task}（${delta}天后）`);
      } else {
        lines.push(`  · [${contact}] ${task}`);
      }
    }
    return lines.join('\n');
  } catch (e) {
    console.log('[cloudListTodos] failed:', e.message);
    return '';
  }
}

async function cloudListContacts() {
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return '';
  try {
    const resp = await fetch(`${CLOUD_URL}/data/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const contacts = data.contacts || [];
    if (contacts.length === 0) return '联系人：暂无记录';
    const lines = [`【联系人】共 ${data.total || contacts.length} 位`];
    for (const c of contacts) {
      const nature = c.nature === 'nurture' ? '陪伴' : (c.nature === 'dual' ? '双重' : '经营');
      lines.push(`  · ${c.name} | ${c.relation || c.role || ''} | ${nature}`);
    }
    return lines.join('\n');
  } catch (e) {
    console.log('[cloudListContacts] failed:', e.message);
    return '';
  }
}

async function agentSearch(keywords, contactName, intent) {
  // Ask agent to search contacts by keywords (two-step flow step 2)
  // Returns {data_context, matched_count, conversation} or null
  if (!bridgeFrame || !bridgeReady) return null;
  return new Promise((resolve) => {
    const reqId = 'sch_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.data) {
          resolve(msg.data.data);
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 5000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'search', id: reqId, keywords: keywords, contact_name: contactName, intent: intent }
    }, '*');
  });
}

// Fetch routing config from cloud (mode, timeouts, tier info)
async function fetchRoutingConfig() {
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/config`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.routing) routingConfig = data.routing;
      if (data.data_priority && Array.isArray(data.data_priority)) dataPriority = data.data_priority;
      console.log('[routing] Config loaded:', routingConfig, 'data_priority:', dataPriority);
    }
  } catch (e) {
    console.log('[routing] Config fetch failed, using defaults:', e.message);
  }
}

// Decide whether to route via Live (local agent) or Cloud based on config
function shouldUseLive() {
  const mode = routingConfig.mode || 'auto';
  if (mode === 'cloud_only') return false;
  if (mode === 'live_first' || mode === 'cloud_first') return bridgeReady;
  // auto: Live if bridge ready
  return isLive && bridgeReady;
}

// Should we try Cloud as fallback after Live fails?
function shouldFallbackToCloud() {
  return routingConfig.mode !== 'cloud_only' || !shouldUseLive();
}

async function extractIntent(text) {
  // Step 1: Cloud LLM extracts intent + keywords from user message
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return null;
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/extract_intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, text: text }),
    });
    if (!resp.ok) {
      console.error('[extractIntent] API returned', resp.status, await resp.text().catch(()=>''));
      return null;
    }
    const data = await resp.json();
    console.log('[extractIntent]', JSON.stringify(data));
    return data;
  } catch (e) {
    console.log('[extractIntent] failed:', e.message);
    return null;
  }
}

async function cloudChat(text, attachedFile) {
  // Two-step LLM flow with Clerk JWT auth:
  // 1. Cloud LLM extracts intent + keywords
  // 2. Agent searches contacts by keywords (or cloud KV fallback)
  // 3. Cloud LLM generates reply with precise data context
  console.log('[cloudChat] Start, bridgeReady:', bridgeReady, 'isLive:', isLive, 'mode:', routingConfig.mode);

  // /model <name> — switch Devin CLI model (via --model CLI flag, not slash command)
  // Must intercept BEFORE devin passthrough: devin -p mode doesn't handle /model slash command
  if (text.startsWith('/model ') && bridgeReady) {
    const modelName = text.slice(7).trim();
    if (modelName) {
      const result = await agentConfig('set', { engine: 'devin', devin: { model: modelName } });
      if (result && result.ok) {
        window._agentEngine = 'devin';
        return `✅ Devin CLI 模型已切换为 ${modelName}（下条消息生效）`;
      }
      return '⚠️ 模型切换失败，请确认本地 agent 已连接';
    }
  }

  // /engine <edge|devin> — switch agent engine
  if (text.startsWith('/engine ') && bridgeReady) {
    const engineName = text.slice(8).trim().toLowerCase();
    if (engineName === 'edge' || engineName === 'devin') {
      const result = await agentConfig('set', { engine: engineName });
      if (result && result.ok) {
        window._agentEngine = engineName;
        return `✅ Agent 引擎已切换为 ${engineName === 'devin' ? 'Devin CLI' : 'Edge (本地 LLM)'}`;
      }
      return '⚠️ 引擎切换失败，请确认本地 agent 已连接';
    }
    return '⚠️ 未知引擎，支持：edge | devin';
  }

  // In Devin CLI passthrough mode, all other messages go straight to Devin
  if (window._agentEngine === 'devin' && shouldUseLive()) {
    console.log('[cloudChat] Devin CLI passthrough — forwarding all text to Devin');
    // Data flywheel: still run extract_intent async to capture contacts/todos/timeline
    extractIntent(text).then(intent => {
      if (intent && intent.action_results && intent.action_results.length > 0) {
        const actions = intent.action_results.filter(a => a.ok);
        if (actions.length > 0) {
          const parts = actions.map(a => {
            if (a.type === 'add_contact') return `已添加联系人「${a.name}」`;
            if (a.type === 'add_timeline') return `已记录互动「${a.summary}」`;
            if (a.type === 'add_todo') return `已添加待办「${a.task}」`;
            if (a.type === 'complete_todo') return `已完成待办「${a.task}」`;
            if (a.type === 'delete_todo') return `已删除待办「${a.task}」`;
            if (a.type === 'update_contact') return `已更新联系人「${a.contact_name}」`;
            if (a.type === 'merge_contact') return `已合并联系人「${a.source_name}」→「${a.target_name}」`;
            return '';
          }).filter(Boolean);
          if (parts.length > 0) {
            console.log('[cloudChat] Data flywheel (devin mode):', parts.join('，'));
            loadChatEnhancements();
          }
        }
      }
    }).catch(e => console.warn('[cloudChat] extractIntent (devin mode) failed:', e.message));
    const typingEl = document.getElementById('typing');
    if (typingEl) {
      const bubble = typingEl.querySelector('.bubble');
      if (bubble) bubble.innerHTML = '<span style="font-size:.85em;color:var(--dim)">⚡ Devin CLI 执行中…</span>';
    }
    const reply = await agentChat(text, 3600000, attachedFile);
    if (reply) {
      saveSessionTurn(text, reply).catch(e => console.warn('[session] save failed:', e.message));
      return reply;
    }
    return '⚠️ Devin CLI 未响应，请检查 devin 命令是否可用';
  }

  // /devin prefix: direct Devin CLI passthrough (edge/cloud mode only)
  if (text.startsWith('/devin ') && bridgeReady) {
    const devinText = text.slice(7).trim();
    if (devinText) {
      console.log('[cloudChat] Direct Devin CLI passthrough');
      const reply = await devinDirect(devinText);
      if (reply) {
        saveSessionTurn(text, reply).catch(e => console.warn('[session] save failed:', e.message));
        return reply;
      }
      return '⚠️ Devin CLI 未响应，请确认 devin 命令已安装';
    }
  }

  // Live mode: route through local agent (edge LLM only — devin handled above)
  if (shouldUseLive()) {
    console.log('[cloudChat] Routing via local agent (edge LLM)');
    // Data flywheel: still run extract_intent async to capture contacts/todos/timeline
    extractIntent(text).then(intent => {
      if (intent && intent.action_results && intent.action_results.length > 0) {
        const actions = intent.action_results.filter(a => a.ok);
        if (actions.length > 0) {
          const hasContact = actions.some(a => a.type === 'add_contact' || a.type === 'update_contact' || a.type === 'merge_contact');
          const hasTodo = actions.some(a => a.type === 'add_todo' || a.type === 'complete_todo' || a.type === 'delete_todo');
          const hasTimeline = actions.some(a => a.type === 'add_timeline');
          if (hasContact || hasTodo || hasTimeline) {
            console.log('[cloudChat] Data flywheel (edge mode):', intent.action_results.length, 'actions');
            loadChatEnhancements();
          }
        }
      }
    }).catch(e => console.warn('[cloudChat] extractIntent (edge mode) failed:', e.message));
    const reply = await agentChat(text, undefined, attachedFile);
    if (reply) {
      // Save to cloud session for history
      saveSessionTurn(text, reply).catch(e => console.warn('[session] save failed:', e.message));
      return reply;
    }
    // Fallback to cloud if agent fails
    console.log('[cloudChat] Local agent failed, falling back to cloud');
  }

  // Get auth token (Clerk JWT or simulation demo token)
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) {
    throw new Error('请先登录');
  }

  // Step 1: Extract intent + keywords + execute data actions (data flywheel)
  const intent = await extractIntent(text);
  let dataContext = '';
  let conversationHistoryFromAgent = [];
  let flywheelInfo = '';

  // Show data flywheel results
  if (intent && intent.action_results && intent.action_results.length > 0) {
    const actions = intent.action_results.filter(a => a.ok);
    if (actions.length > 0) {
      const parts = actions.map(a => {
        if (a.type === 'add_contact') return `已添加联系人「${a.name}」`;
        if (a.type === 'add_timeline') return `已记录互动「${a.summary}」`;
        if (a.type === 'add_todo') return `已添加待办「${a.task}」`;
        if (a.type === 'complete_todo') return `已完成待办「${a.task}」`;
        if (a.type === 'delete_todo') return `已删除待办「${a.task}」`;
        if (a.type === 'update_contact') return `已更新联系人「${a.contact_name}」`;
        if (a.type === 'merge_contact') return `已合并联系人「${a.source_name}」→「${a.target_name}」`;
        return '';
      }).filter(Boolean);
      flywheelInfo = parts.join('，');
      console.log('[cloudChat] Data flywheel:', flywheelInfo);
      // Refresh caches so new data shows up in sidebar/tabs
      const hasTimeline = actions.some(a => a.type === 'add_timeline');
      const hasContact = actions.some(a => a.type === 'add_contact' || a.type === 'update_contact' || a.type === 'merge_contact');
      const hasTodo = actions.some(a => a.type === 'add_todo' || a.type === 'complete_todo' || a.type === 'delete_todo');
      if (hasTimeline || hasContact || hasTodo) {
        // Async refresh — don't block the reply
        loadChatEnhancements();
      }
    }
  }

  // Auto-learned profile updates
  if (intent && intent.profile_updated) {
    cachedUserProfile = ''; cachedUserProfileObj = null; // invalidate cache so next chat reloads profile
    console.log('[cloudChat] Profile auto-updated from conversation');
  }

  // Memory saved — notify user (F1)
  if (intent && intent.memory_saved) {
    console.log('[cloudChat] Memory auto-saved from conversation:', intent.memory_saved_id);
    // Show visible feedback after reply
    setTimeout(() => {
      const memHint = document.createElement('div');
      memHint.style.cssText = 'font-size:12px;color:#888;padding:4px 12px;margin-top:4px;';
      memHint.textContent = '🧠 已记住这条信息，下次对话会自动参考';
      const lastMsg = document.querySelector('#chatMessages .message:last-child');
      if (lastMsg) lastMsg.appendChild(memHint);
    }, 500);
  }

  // Goal evidence linked — notify user (G1)
  if (intent && intent.goal_evidence_linked) {
    console.log('[cloudChat] Goal evidence linked:', intent.goal_evidence_goal_title);
    setTimeout(() => {
      const goalHint = document.createElement('div');
      goalHint.style.cssText = 'font-size:12px;color:#22c55e;padding:4px 12px;margin-top:4px;';
      goalHint.textContent = `🎯 已关联到目标「${intent.goal_evidence_goal_title}」`;
      const lastMsg = document.querySelector('#chatMessages .message:last-child');
      if (lastMsg) lastMsg.appendChild(goalHint);
    }, 600);
  }

  // Step 2: Get data context based on intent
  // Data source priority is configurable via dataPriority (from /ai/config)
  // Default: ['cloud_kv', 'agent'] — cloud first, agent fallback
  // Can be set to ['agent', 'cloud_kv'] — agent first, cloud fallback
  const hasKeywords = intent && (intent.contact_name || (intent.keywords && intent.keywords.length > 0));
  const intentType = intent ? intent.intent : '';

  for (const source of dataPriority) {
    if (dataContext) break;  // already got data, stop

    if (source === 'cloud_kv') {
      if (hasKeywords) {
        console.log('[cloudChat] Trying cloud_kv search for:', intent.contact_name, intent.keywords);
        const cloudResult = await cloudSearch(intent.keywords || [], intent.contact_name || '');
        if (cloudResult) {
          dataContext = cloudResult.data_context || '';
          console.log('[cloudChat] cloud search, data_context len:', dataContext.length, 'matched:', cloudResult.matched_count);
        }
      } else if (intentType === 'query_todo') {
        dataContext = await cloudListTodos();
        if (dataContext) console.log('[cloudChat] cloud todos list, len:', dataContext.length);
      } else if (intentType === 'query_contact') {
        dataContext = await cloudListContacts();
        if (dataContext) console.log('[cloudChat] cloud contacts list, len:', dataContext.length);
      } else {
        dataContext = await getCloudDataContext();
        if (dataContext) console.log('[cloudChat] cloud KV context, data_context len:', dataContext.length);
      }
    } else if (source === 'agent') {
      if (!bridgeFrame || !bridgeReady) continue;  // agent not available
      if (hasKeywords) {
        console.log('[cloudChat] Trying agent search for:', intent.contact_name, intent.keywords);
        const searchResult = await agentSearch(intent.keywords || [], intent.contact_name || '', intentType || '');
        if (searchResult) {
          dataContext = searchResult.data_context || '';
          conversationHistoryFromAgent = searchResult.conversation || [];
          console.log('[cloudChat] agent search, data_context len:', dataContext.length, 'matched:', searchResult.matched_count);
        }
      } else {
        const agentContext = await getAgentContext(text);
        if (agentContext) {
          dataContext = agentContext.data_context || '';
          conversationHistoryFromAgent = agentContext.conversation || [];
          console.log('[cloudChat] agent context, data_context len:', dataContext.length);
        }
      }
    }
  }

  // Step 3: Build messages for cloud LLM
  const systemPrompt = await getSystemPrompt(text, intentType);

  // Web search — if AI determined search is needed
  let searchContext = '';
  if (intent && intent.needs_search && intent.search_query) {
    console.log('[cloudChat] Web search needed:', intent.search_query);
    try {
      const searchToken = simulationMode
        ? `demo_${simulationData.id}:demo_secret`
        : await getClerkToken();
      if (searchToken) {
        const searchResp = await fetch(`${CLOUD_URL}/ai/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${searchToken}` },
          body: JSON.stringify({ session_token: searchToken, query: intent.search_query }),
        });
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          if (searchData.search_context) {
            searchContext = searchData.search_context;
            console.log('[cloudChat] Web search results, len:', searchContext.length, 'provider:', searchData.provider);

            // G4: Auto-read top search result for deeper context
            if (searchData.results && searchData.results.length > 0 && searchData.results[0].url) {
              const topUrl = searchData.results[0].url;
              console.log('[cloudChat] Reading top result:', topUrl);
              try {
                const readResp = await fetch(`${CLOUD_URL}/ai/read_url`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${searchToken}` },
                  body: JSON.stringify({ session_token: searchToken, url: topUrl }),
                });
              if (readResp.ok) {
                const readData = await readResp.json();
                if (readData.status === 'ok' && readData.content) {
                  // Append full page content to search context
                  const pageContent = readData.content.slice(0, 4000); // cap at 4000 chars
                  searchContext += `\n\n--- 网页全文（${readData.title || topUrl}）---\n${pageContent}\n--- 网页全文结束 ---\n`;
                  console.log('[cloudChat] Read full page, +chars:', pageContent.length);
                }
              }
            } catch (e) {
              console.log('[cloudChat] Read URL failed:', e.message);
            }
          }
        }
      }
      }
    } catch (e) {
      console.log('[cloudChat] Web search failed:', e.message);
    }
  }

  // Build user message: combine text + data context + search results + flywheel info
  let userContent = text;
  const contextParts = [];
  if (dataContext) contextParts.push(`相关数据：\n${dataContext}`);
  if (searchContext) contextParts.push(searchContext);
  if (flywheelInfo) contextParts.push(`系统已自动执行：${flywheelInfo}。请在回复中确认已记录。`);
  if (contextParts.length > 0) {
    userContent = `用户消息：${text}\n\n${contextParts.join('\n\n')}\n\n请根据用户的消息和上面的数据，生成回复。直接回复内容，不要加"回复："之类的前缀。`;
  }

  // Build messages array: conversation history + current message
  const messages = [];
  if (conversationHistoryFromAgent.length > 0) {
    messages.push(...conversationHistoryFromAgent.slice(-4));
  } else if (conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-4));
  }

  // If file attached, build multimodal content (text + file block)
  if (attachedFile && attachedFile.base64) {
    const fileBlock = attachedFile.isImage
      ? { type: 'image', source: { type: 'base64', media_type: attachedFile.mediaType, data: attachedFile.base64 } }
      : { type: 'document', source: { type: 'base64', media_type: attachedFile.mediaType, data: attachedFile.base64 } };
    const textBlock = { type: 'text', text: userContent || '请分析这个文件的内容。' };
    messages.push({ role: 'user', content: [fileBlock, textBlock] });
  } else {
    messages.push({ role: 'user', content: userContent });
  }

  // Step 4: Call cloud LLM
  console.log('[cloudChat] Calling cloud LLM, messages:', messages.length, 'total content len:', messages.reduce((a,m)=>a+(m.content||'').length,0));
  // Refresh token before LLM call — earlier steps may have taken time, token could expire
  const chatToken = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!chatToken) throw new Error('请先登录');
  chatAbortController = new AbortController(); // H5: create abort controller
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${chatToken}` },
      body: JSON.stringify({
        session_token: chatToken,
        messages: messages,
        system: systemPrompt,
        max_tokens: 1024,
        model_tier: attachedFile ? 'enhanced' : currentModelTier,
      }),
      signal: chatAbortController.signal, // H5: attach abort signal
    });

    console.log('[cloudChat] Cloud response status:', resp.status);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log('[cloudChat] Cloud reply length:', (data.reply||'').length);

    // Update conversation history
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: data.reply });
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    if (bridgeFrame && bridgeReady) {
      saveAgentTurn(text, data.reply);
    }

    // H4: Persist to cloud session (fire-and-forget, don't block reply)
    saveSessionTurn(text, data.reply).catch(e => console.warn('[session] save failed:', e.message));

    // Check simulation goals after reply
    if (simulationMode) {
      checkSimulationGoals(intent, data.reply);
    }

    return data.reply;
  } catch (e) {
    throw e;
  }
}

// Cloud mode conversation history (kept in browser memory)
let conversationHistory = [];
let chatAbortController = null; // H5: for stopping in-progress chat
let currentSessionId = null; // H4: active cloud session ID
let sessionList = []; // H4: cached session list

// H4: Save a turn (user + assistant) to cloud session
async function saveSessionTurn(userMsg, assistantMsg) {
  if (simulationMode) return; // skip in simulation
  const token = await getClerkToken();
  if (!token) return;
  await fetch(`${CLOUD_URL}/data/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      session_token: token,
      action: 'append',
      session_id: currentSessionId,
      user_message: userMsg,
      assistant_message: assistantMsg,
    }),
  }).then(r => r.json()).then(data => {
    if (data.session_id && !currentSessionId) currentSessionId = data.session_id;
  });
}

// H4: Load session list from cloud
async function loadSessionList() {
  if (simulationMode) return;
  const token = await getClerkToken();
  if (!token) return;
  const resp = await fetch(`${CLOUD_URL}/data/sessions`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) return;
  const data = await resp.json();
  sessionList = data.sessions || [];
  renderSessionList();
}

// H4: Load a specific session and restore conversation
async function loadSession(sessionId) {
  const token = await getClerkToken();
  if (!token) return;
  const resp = await fetch(`${CLOUD_URL}/data/sessions?id=${sessionId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) return;
  const data = await resp.json();
  const session = data.session;
  if (!session) return;
  currentSessionId = session.id;
  // Clear chat and replay messages
  body.innerHTML = '';
  conversationHistory = [];
  for (const msg of (session.messages || [])) {
    addMsg(msg.role === 'user' ? 'you' : 'ai', msg.content);
    if (msg.role === 'user' || msg.role === 'assistant') {
      conversationHistory.push({ role: msg.role, content: msg.content });
    }
  }
  // Add summary chip at the end
  if ((session.messages || []).length > 0) {
    const zh = currentLang === 'zh';
    const chipDiv = document.createElement('div');
    chipDiv.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;';
    const chip = document.createElement('button');
    chip.textContent = zh ? '📝 生成会话摘要' : '📝 Summarize session';
    chip.style.cssText = 'padding:5px 12px;border:1px solid var(--border);border-radius:12px;background:transparent;color:var(--dim);font-size:.78em;cursor:pointer;transition:all .15s;font-family:inherit;';
    chip.onmouseenter = () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; };
    chip.onmouseleave = () => { chip.style.borderColor = 'var(--border)'; chip.style.color = 'var(--dim)'; };
    chip.onclick = async () => {
      chip.textContent = zh ? '⏳ 生成中…' : '⏳ Generating…';
      chip.disabled = true;
      try {
        const summaryResp = await fetch(`${CLOUD_URL}/ai/session_summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ session_token: token, session_id: session.id }),
        });
        const summaryData = await summaryResp.json();
        const summary = summaryData.summary || (zh ? '无法生成摘要' : 'Failed to generate summary');
        addMsg('ai', zh ? `📋 **会话摘要**\n\n${summary}` : `📋 **Session Summary**\n\n${summary}`);
      } catch (e) {
        addMsg('ai', zh ? `生成摘要失败: ${e.message}` : `Summary failed: ${e.message}`);
      }
      chipDiv.remove();
    };
    chipDiv.appendChild(chip);
    body.appendChild(chipDiv);
    scrollToBottom();
  }
  hideWelcome();
  closeSidebar();
}

// H4: Start a new session
function startNewSession() {
  currentSessionId = null;
  conversationHistory = [];
  body.innerHTML = '';
  showWelcome();
  closeSidebar();
}

// H4: Delete a session
async function deleteSession(sessionId) {
  const token = await getClerkToken();
  if (!token) return;
  await fetch(`${CLOUD_URL}/data/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ session_token: token, action: 'delete', session_id: sessionId }),
  });
  await loadSessionList();
}

// H4: Render session list in sidebar
function renderSessionList() {
  const container = document.getElementById('sessionListItems');
  if (!container) return;
  const filter = (window._sessionFilter || '').toLowerCase();
  const filtered = filter ? sessionList.filter(s => (s.title || '').toLowerCase().includes(filter)) : sessionList;
  if (filtered.length === 0) {
    container.innerHTML = `<div class="sidebar-empty">${filter ? '没有匹配的会话' : '暂无历史会话<br>开始聊天后会自动保存'}</div>`;
    return;
  }
  container.innerHTML = filtered.map(s => {
    const time = new Date(s.updated_at).toLocaleDateString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const isActive = s.id === currentSessionId;
    return `<div class="session-item ${isActive ? 'active' : ''}" onclick="loadSession('${s.id}')">
      <div style="flex:1;min-width:0">
        <div class="session-item-title">${escapeHtml(s.title)}</div>
        <div class="session-item-meta">${time} · ${s.message_count} 条</div>
      </div>
      <button class="session-item-delete" onclick="event.stopPropagation();deleteSession('${s.id}')" title="删除">✕</button>
    </div>`;
  }).join('');
}

// H4: Filter sessions by search text
function filterSessions(query) {
  window._sessionFilter = query;
  renderSessionList();
}

// H4: Sidebar toggle (mobile: tap, desktop: toggle collapsed state, hover expands)
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebarOpenBtn');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
      sidebar.classList.remove('mobile-open');
      document.getElementById('sidebarOverlay').classList.remove('show');
      if (openBtn) openBtn.style.display = 'inline-block';
    } else {
      sidebar.classList.add('mobile-open');
      document.getElementById('sidebarOverlay').classList.add('show');
      if (openBtn) openBtn.style.display = 'none';
      loadSessionList();
    }
  } else {
    // Desktop: toggle collapsed (hover will re-expand)
    sidebar.classList.toggle('collapsed');
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebarOpenBtn');
  sidebar.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('show');
  // On mobile, show hamburger button when sidebar closes
  if (window.innerWidth <= 768 && openBtn) openBtn.style.display = 'inline-block';
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebarOpenBtn');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    sidebar.classList.add('mobile-open');
    document.getElementById('sidebarOverlay').classList.add('show');
    if (openBtn) openBtn.style.display = 'none';
  }
  // Desktop: sidebar is hover-controlled, no need to force open
  loadSessionList();
}

// Load AGENTS.md as system prompt (configurable without code changes)
let cachedSystemPrompt = '';
let cachedUserProfile = '';
let cachedUserProfileObj = null;
async function getSystemPrompt(userQuery, intent) {
  // Load user profile from authenticated API (per-user, stored in KV)
  if (cachedUserProfile === '' && isAuthed) {
    try {
      const profileResp = await mineApi('/data/profile');
      if (profileResp && profileResp.profile) {
        const p = profileResp.profile;
        cachedUserProfileObj = p;
        const parts = [];
        if (p.name) parts.push(`姓名：${p.name}`);
        if (p.occupation) parts.push(`职业：${p.occupation}`);
        if (p.company) parts.push(`公司：${p.company}`);
        if (p.industry) parts.push(`行业：${p.industry}`);
        if (p.location) parts.push(`所在地：${p.location}`);
        if (p.communication_style) parts.push(`沟通风格：${p.communication_style}`);
        if (p.address_habit) parts.push(`称呼习惯：${p.address_habit}`);
        if (p.focus_areas) parts.push(`关注领域：${p.focus_areas}`);
        if (p.message_tone) parts.push(`拟消息语气：${p.message_tone}`);
        if (p.career_goal) parts.push(`当前职业目标：${p.career_goal}`);
        if (p.current_projects) parts.push(`正在推进的事：${p.current_projects}`);
        if (p.network_direction) parts.push(`人脉方向：${p.network_direction}`);
        if (p.notes) parts.push(`附注：${p.notes}`);
        if (parts.length > 0) {
          cachedUserProfile = '\n\n--- 用户画像 ---\n' + parts.join('\n');
          console.log('[getSystemPrompt] Loaded user profile, fields:', parts.length);
        } else {
          cachedUserProfile = ' ';
        }
      } else {
        cachedUserProfile = ' ';
      }
    } catch (e) {
      console.log('[getSystemPrompt] Failed to load profile:', e.message);
      cachedUserProfile = ' ';
    }
  }

  // Auto-recall relevant memories based on user query (F1)
  let memoryContext = '';
  if (isAuthed && userQuery) {
    try {
      const memResp = await mineApi('/data/memory?q=' + encodeURIComponent(userQuery) + '&limit=3');
      if (memResp && memResp.memories && memResp.memories.length > 0) {
        const memLines = memResp.memories.map(m => `- ${m.title}: ${m.content}`);
        memoryContext = '\n\n--- 相关记忆 ---\n' + memLines.join('\n');
        console.log('[getSystemPrompt] Recalled memories:', memResp.memories.length);
      }
    } catch (e) {
      console.log('[getSystemPrompt] Memory recall failed:', e.message);
    }
  }

  // Load skills based on intent (F4)
  let skillsContext = '';
  if (intent) {
    try {
      const skillsData = await mineApi('/ai/skills?intent=' + encodeURIComponent(intent));
      if (skillsData && skillsData.skills && skillsData.skills.length > 0) {
        skillsContext = '\n\n--- 可用技能 ---\n' + skillsData.skills.map(s => s.content).join('\n');
        console.log('[getSystemPrompt] Loaded skills:', skillsData.skills.map(s => s.name).join(', '));
      }
    } catch (e) {
      console.log('[getSystemPrompt] Skills load failed:', e.message);
    }
  }

  if (cachedSystemPrompt) {
    return cachedSystemPrompt + cachedUserProfile + memoryContext + skillsContext + getCurrentDateTimeContext();
  }
  try {
    const resp = await fetch('/AGENTS.md');
    if (resp.ok) {
      cachedSystemPrompt = await resp.text();
      console.log('[getSystemPrompt] Loaded AGENTS.md, len:', cachedSystemPrompt.length);
      return cachedSystemPrompt + cachedUserProfile + memoryContext + skillsContext + getCurrentDateTimeContext();
    }
  } catch (e) {
    console.log('[getSystemPrompt] Failed to load AGENTS.md:', e.message);
  }
  // Fallback to hardcoded prompt
  cachedSystemPrompt = `你是 Welian，一个关系管理 AI 助手。你帮用户管理社交关系、记录互动、提醒待办、拟写消息。

基于诚实原则，不编造事实和数据。如果数据中没有相关信息，如实告知用户。

你的风格：
- 简洁友好，像朋友在聊天
- 中文回复，适当用 emoji
- 回复不要太长，重点突出
- 如果用户在记录事情，确认记下了并简要复述
- 如果用户在查待办，只列出数据中有的待办，按紧急程度分组
- 如果用户在闲聊，自然回应，可以引导到关系管理话题

你会收到用户的原始消息和相关数据上下文。请严格基于数据回答，不要编造。
对话是连续的，请结合上下文理解用户的意图。`;
  return cachedSystemPrompt + cachedUserProfile + getCurrentDateTimeContext();
}

function getCurrentDateTimeContext() {
  const now = new Date();
  const zh = currentLang === 'zh';
  const weekdays = zh ? ['周日','周一','周二','周三','周四','周五','周六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dateStr = localDateStr(now);
  const timeStr = now.toLocaleTimeString(zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const weekday = weekdays[now.getDay()];
  const parts = [];

  // 1. Date + time + city + weather
  const w = weatherCache;
  const city = w?.city || '';
  const wDesc = w ? (zh ? `${w.temp}°${weatherText(w.code, zh)}` : `${w.temp}°${weatherText(w.code, zh)}`) : '';
  const locPart = city ? (zh ? `，在${city}` : `, in ${city}`) : '';
  const wxPart = wDesc ? (zh ? `，天气${wDesc}` : `, ${wDesc}`) : '';
  parts.push(zh
    ? `今天是 ${dateStr} ${weekday}，现在 ${timeStr}${locPart}${wxPart}。`
    : `Today is ${dateStr} ${weekday}, ${timeStr}${locPart}${wxPart}.`);

  // 2. Time-of-day semantic
  const h = now.getHours();
  let timeSlot;
  if (zh) {
    if (h < 6) timeSlot = '深夜（用户可能准备休息，建议简短温和）';
    else if (h < 9) timeSlot = '清晨（适合规划今天要联系谁）';
    else if (h < 12) timeSlot = '上午（工作时段，适合记录和拟消息）';
    else if (h < 14) timeSlot = '午休（适合快速记录互动）';
    else if (h < 18) timeSlot = '下午（工作时段）';
    else if (h < 22) timeSlot = '晚间（适合反思、写长消息、整理关系）';
    else timeSlot = '深夜（建议温和不催促）';
  } else {
    if (h < 6) timeSlot = 'late night (keep it brief and gentle)';
    else if (h < 9) timeSlot = 'early morning (good for planning who to contact)';
    else if (h < 12) timeSlot = 'morning (work hours, good for recording and drafting)';
    else if (h < 14) timeSlot = 'lunch break (good for quick interaction logging)';
    else if (h < 18) timeSlot = 'afternoon (work hours)';
    else if (h < 22) timeSlot = 'evening (good for reflection, long messages, organizing)';
    else timeSlot = 'late night (be gentle, no urging)';
  }
  parts.push(zh ? `时段：${timeSlot}` : `Time slot: ${timeSlot}`);

  // 3. Device type
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPod/.test(ua);
  const isTablet = /iPad|Tablet/.test(ua);
  const device = isMobile ? (zh ? '手机' : 'mobile') : isTablet ? (zh ? '平板' : 'tablet') : (zh ? '桌面端' : 'desktop');
  parts.push(zh ? `设备：${device}${isMobile ? '（建议简短操作，避免长表单）' : ''}` : `Device: ${device}${isMobile ? ' (prefer brief interactions)' : ''}`);

  // 4. Upcoming holidays (within 14 days)
  const holidays = getUpcomingHolidays(now, zh);
  if (holidays.length > 0) {
    parts.push(zh ? `近期节日：${holidays.join('、')}` : `Upcoming holidays: ${holidays.join(', ')}`);
  }

  // 5. Today's activity count
  const todayStr = dateStr;
  const timeline = chatDataCache.timeline || mineCache.timeline || [];
  const todayCount = timeline.filter(t => (t.date || '').slice(0, 10) === todayStr).length;
  if (todayCount > 0) {
    parts.push(zh ? `今日已记录 ${todayCount} 条互动` : `${todayCount} interactions recorded today`);
  } else {
    parts.push(zh ? `今日尚未记录互动` : `No interactions recorded today`);
  }

  // 6. Calendar events (if available)
  if (window._calendarEvents && window._calendarEvents.length > 0) {
    const todayEvents = window._calendarEvents.filter(e => (e.date || '').slice(0, 10) === todayStr);
    if (todayEvents.length > 0) {
      const evList = todayEvents.slice(0, 5).map(e => `${e.time || ''} ${e.title || ''}`.trim()).join('; ');
      parts.push(zh ? `今日日程：${evList}` : `Today's schedule: ${evList}`);
    }
  }

  // 7. Location semantic (home/office/traveling) — inferred from cached location vs profile
  const profile = cachedUserProfileObj || {};
  const profileLoc = profile.location || '';
  if (city && profileLoc) {
    const sameCity = city.includes(profileLoc) || profileLoc.includes(city);
    if (!sameCity) {
      parts.push(zh ? `用户正在出差/外出（常驻地${profileLoc}，当前在${city}）` : `User is traveling (based in ${profileLoc}, currently in ${city})`);
    }
  }

  const header = zh ? '--- 当前环境 ---' : '--- Current Context ---';
  return `\n\n${header}\n${parts.join('\n')}`;
}

// Chinese lunar holidays approximation (fixed dates or lunar-based)
function getUpcomingHolidays(now, zh) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const today = new Date(y, m - 1, d);
  const list = [];

  // Fixed-date holidays: [month, day, zhName, enName]
  const fixed = [
    [1, 1, '元旦', 'New Year'],
    [2, 14, '情人节', "Valentine's Day"],
    [3, 8, '妇女节', "Women's Day"],
    [5, 1, '劳动节', 'Labor Day'],
    [6, 1, '儿童节', "Children's Day"],
    [10, 1, '国庆节', 'National Day'],
    [12, 25, '圣诞节', 'Christmas'],
    [12, 31, '跨年', "New Year's Eve"],
  ];

  for (const [mo, dy, zhN, enN] of fixed) {
    let date = new Date(y, mo - 1, dy);
    if (date < today) date = new Date(y + 1, mo - 1, dy);
    const daysAway = Math.round((date - today) / 86400000);
    if (daysAway <= 14 && daysAway >= 0) {
      const label = zh ? zhN : enN;
      list.push(daysAway === 0 ? (zh ? `今天${label}` : `today is ${label}`) : (zh ? `${daysAway}天后${label}（${mo}/${dy}）` : `${label} in ${daysAway} days (${mo}/${dy})`));
    }
  }

  // Lunar holidays — approximate dates for current year (precomputed)
  // These are close enough for "within 14 days" reminders
  const lunar = getLunarHolidays(y, zh);
  for (const { date, name } of lunar) {
    const daysAway = Math.round((date - today) / 86400000);
    if (daysAway <= 14 && daysAway >= 0) {
      list.push(daysAway === 0 ? (zh ? `今天${name}` : `today is ${name}`) : (zh ? `${daysAway}天后${name}` : `${name} in ${daysAway} days`));
    }
  }

  return list;
}

// Approximate lunar holiday dates for major Chinese holidays
function getLunarHolidays(year, zh) {
  // Precomputed/approximate lunar dates for Chinese holidays
  // Good enough for "within 14 days" reminder purposes
  const table = {
    2025: { '春节': '2025-01-29', '元宵节': '2025-02-12', '端午节': '2025-05-31', '中秋节': '2025-10-06' },
    2026: { '春节': '2026-02-17', '元宵节': '2026-03-03', '端午节': '2026-06-19', '中秋节': '2026-09-25' },
    2027: { '春节': '2027-02-06', '元宵节': '2027-02-20', '端午节': '2027-06-15', '中秋节': '2027-09-15' },
  };
  const names = zh
    ? { '春节': '春节', '元宵节': '元宵节', '端午节': '端午节', '中秋节': '中秋节' }
    : { '春节': 'Spring Festival', '元宵节': 'Lantern Festival', '端午节': 'Dragon Boat Festival', '中秋节': 'Mid-Autumn Festival' };
  const yearTable = table[year] || table[year + 1] || {};
  return Object.entries(yearTable).map(([k, v]) => ({
    date: new Date(v),
    name: names[k] || k,
  }));
}

// ── Simulation mode (celebrity role-play demo) ──

let simulationMode = false;
let simulationPersona = null;
let simulationData = null;
let simulationGoals = [];

const SCENARIO_IDS = ['jobs', 'musk', 'zhang', 'obama', 'renzhengfei', 'leijun', 'wangxing', 'caodewang', 'dongmingzhu', 'buffett', 'bezos', 'gates', 'zhouxingchi', 'lian', 'maotai', 'yanglan', 'maotai2', 'yuminhong', 'huangzheng', 'lishufu', 'inamori', 'oprah', 'wangshi', 'zongqinghou', 'zhongshanshan', 'sandberg', 'zhangruimin'];

async function showScenarioPicker() {
  const d = I18N[currentLang];
  const picker = document.getElementById('scenarioPicker');
  const cards = document.getElementById('scenarioCards');
  cards.innerHTML = `<p style="color:var(--dim);font-size:.8em">${d.roleplay_loading}</p>`;
  picker.style.display = 'flex';

  // Load all scenarios
  try {
    const scenarios = await Promise.all(
      SCENARIO_IDS.map(id => fetch(`/scenarios/${id}.json`).then(r => r.json()))
    );
    // Randomly pick 5
    const shuffled = [...scenarios].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 5);
    cards.innerHTML = picked.map(s => `
      <div class="scenario-card" onclick="startSimulation('${s.id}')">
        <div class="scenario-card-avatar">${s.avatar}</div>
        <div class="scenario-card-name">${s.name}</div>
        <div class="scenario-card-title">${s.title}</div>
        <div class="scenario-card-tagline">${s.tagline}</div>
        <div class="scenario-card-goals">🎯 ${s.goals.length} ${d.roleplay_goals_count}</div>
      </div>
    `).join('');
    // Add refresh button
    const refreshDiv = document.createElement('div');
    refreshDiv.style.cssText = 'text-align:center;margin-top:16px;';
    refreshDiv.innerHTML = `<button onclick="showScenarioPicker()" style="padding:8px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--dim);font-size:.85em;cursor:pointer;">${d.roleplay_refresh}</button>`;
    cards.appendChild(refreshDiv);
  } catch (e) {
    cards.innerHTML = `<p style="color:#C65D5D;font-size:.8em">${d.roleplay_load_fail}${e.message}</p>`;
  }
}

function closeScenarioPicker() {
  document.getElementById('scenarioPicker').style.display = 'none';
}

async function startSimulation(scenarioId) {
  closeScenarioPicker();

  // Load scenario data
  const resp = await fetch(`/scenarios/${scenarioId}.json`);
  simulationData = await resp.json();
  simulationPersona = simulationData.name;
  simulationGoals = simulationData.goals.map(g => ({ ...g, done: false }));
  simulationMode = true;

  // Load data into cloud KV under demo namespace
  await loadSimulationToCloud(simulationData);

  // Show goal tracker
  document.getElementById('goalTrackerTitle').textContent = `🎯 ${simulationPersona}`;
  updateGoalTracker();
  document.getElementById('goalTracker').style.display = 'block';
  document.getElementById('goalTracker').classList.add('expanded');

  // Enter cloud mode with simulation
  isCloud = true;
  isAuthed = false; // simulation doesn't need real auth
  hideWelcome();
  clearChat();

  // Show intro message with quick-start buttons
  const isSequential = simulationData.sequential_goals;
  const goalHint = isSequential
    ? `🎯 按时间线推进，完成一个目标后解锁下一个。当前目标：\n\n**${simulationGoals[0].title}**\n${simulationGoals[0].description}\n\n试试这些：`
    : `🎯 右上角有 ${simulationGoals.length} 个目标等你完成。试试这些：`;
  addMsg('ai', `${simulationData.avatar} 你现在是 **${simulationData.name}** — ${simulationData.title}\n\n${simulationData.intro}\n\n${goalHint}`);
  // Add quick-start suggestion chips based on the first goal
  setTimeout(() => {
    const g1 = simulationGoals[0] || {};
    const contact = g1.contact_names?.[0] || '';
    const keyword = g1.keywords?.[0] || '';
    let suggestions;
    if (g1.type === 'record_interaction' && contact) {
      suggestions = [
        '有什么待办？',
        `记一下今天和 ${contact} 聊了关于${keyword}的事`,
        `帮我给 ${contact} 写条消息`,
      ];
    } else if (g1.type === 'draft_message' && contact) {
      suggestions = [
        '有什么待办？',
        `帮我给 ${contact} 写一条消息`,
        '该联系谁？',
      ];
    } else if (contact) {
      suggestions = [
        '有什么待办？',
        `记一下今天和 ${contact} 的互动`,
        `帮我给 ${contact} 写条消息`,
      ];
    } else {
      suggestions = ['有什么待办？', '该联系谁？', '帮我拟一条消息'];
    }
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'suggestion-chips';
    chipsDiv.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px;';
    suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.textContent = s;
      chip.style.cssText = 'padding:6px 14px;border:1px solid var(--border);border-radius:16px;background:transparent;color:var(--text);font-size:.82em;cursor:pointer;';
      chip.onclick = () => { input.value = s; send(); };
      chipsDiv.appendChild(chip);
    });
    const chatBody = document.getElementById('chatBody');
    chatBody.appendChild(chipsDiv);
    const scrollEl = document.querySelector('#chatMain main') || chatBody;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, 500);
}

async function loadSimulationToCloud(data) {
  // Use a demo sync_token to load data into cloud KV
  const demoUserId = `demo_${data.id}`;
  const demoToken = `${demoUserId}:demo_secret`;
  try {
    await fetch(`${CLOUD_URL}/data/sync_full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync_token: demoToken,
        contacts: data.contacts || [],
        todos: data.todos || [],
        timeline: data.timeline || [],
      }),
    });
    console.log('[simulation] Data loaded to cloud for', demoUserId);
  } catch (e) {
    console.error('[simulation] Failed to load data:', e);
  }
}

function updateGoalTracker() {
  const done = simulationGoals.filter(g => g.done).length;
  const total = simulationGoals.length;
  document.getElementById('goalProgress').textContent = `${done}/${total}`;
  const list = document.getElementById('goalTrackerList');
  const isSequential = simulationData && simulationData.sequential_goals;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (isSequential) {
    const firstUndoneIdx = simulationGoals.findIndex(g => !g.done);

    if (isMobile) {
      // Mobile: only show current goal + next goal
      const items = [];
      if (firstUndoneIdx >= 0) {
        const current = simulationGoals[firstUndoneIdx];
        items.push(`<div class="goal-item pending"><div class="goal-item-title">${current.title}</div><div class="goal-item-desc">${current.description}</div></div>`);
        // Next goal preview (locked)
        if (firstUndoneIdx + 1 < simulationGoals.length) {
          items.push(`<div class="goal-item" style="opacity:.4"><div class="goal-item-title">🔒 下一个</div></div>`);
        }
      } else {
        items.push(`<div class="goal-item done"><div class="goal-item-title">🎉 全部完成！</div></div>`);
      }
      list.innerHTML = items.join('');
    } else {
      // Desktop: show all goals
      const items = simulationGoals.map((g, i) => {
        if (g.done) {
          return `<div class="goal-item done"><div class="goal-item-title">${g.title}</div></div>`;
        }
        if (i === firstUndoneIdx) {
          return `<div class="goal-item pending"><div class="goal-item-title">${g.title}</div><div class="goal-item-desc">${g.description}</div></div>`;
        }
        return `<div class="goal-item" style="opacity:.4"><div class="goal-item-title">🔒 ???</div></div>`;
      }).join('');
      list.innerHTML = items;
    }
  } else {
    list.innerHTML = simulationGoals.map(g => `
      <div class="goal-item ${g.done ? 'done' : 'pending'}">
        <div class="goal-item-title">${g.title}</div>
        <div class="goal-item-desc">${g.description}</div>
      </div>
    `).join('');
  }
}

function toggleGoalTracker() {
  document.getElementById('goalTracker').classList.toggle('expanded');
}

async function checkSimulationGoals(intent, reply) {
  if (!simulationMode) return;
  const replyLower = (reply || '').toLowerCase();
  const userText = (intent && intent.contact_name) || '';
  const isSequential = simulationData && simulationData.sequential_goals;

  // In sequential mode, only check the first uncompleted goal
  const goalsToCheck = isSequential
    ? [simulationGoals.find(g => !g.done)].filter(Boolean)
    : simulationGoals;

  for (const goal of goalsToCheck) {
    if (goal.done) continue;

    if (goal.type === 'record_interaction') {
      // Goal: record interactions with specific contacts
      // Check action_results for add_timeline matching contact_names
      if (intent && intent.action_results) {
        for (const ar of intent.action_results) {
          if (!ar.ok || ar.type !== 'add_timeline') continue;
          // Check if this action's contact matches goal's contact_names
          const arContact = (ar.contact_name || ar.summary || '').toLowerCase();
          const matched = (goal.contact_names || []).some(name =>
            arContact.includes(name.toLowerCase())
          );
          // If goal has keywords, also check summary
          let keywordMatch = true;
          if (goal.keywords && goal.keywords.length > 0) {
            const summaryLower = (ar.summary || '').toLowerCase();
            keywordMatch = goal.keywords.some(k => summaryLower.includes(k.toLowerCase()));
            if (goal.need_all_keywords) {
              keywordMatch = goal.keywords.every(k => summaryLower.includes(k.toLowerCase()));
            }
          }
          if (matched && keywordMatch) {
            goal._count = (goal._count || 0) + 1;
            if (goal._count >= (goal.count || 1)) {
              goal.done = true;
            }
          }
        }
      }
    }

    else if (goal.type === 'draft_message') {
      // Goal: draft a message to specific contact or about specific topic
      if (intent && intent.intent === 'draft') {
        // Check contact match
        let contactMatch = true;
        if (goal.contact_names && goal.contact_names.length > 0) {
          const intentContact = (intent.contact_name || '').toLowerCase();
          const replyText = replyLower;
          contactMatch = goal.contact_names.some(name =>
            intentContact.includes(name.toLowerCase()) || replyText.includes(name.toLowerCase())
          );
        }
        // Check keyword match
        let keywordMatch = true;
        if (goal.keywords && goal.keywords.length > 0) {
          keywordMatch = goal.keywords.some(k => replyLower.includes(k.toLowerCase()));
          if (goal.need_all_keywords) {
            keywordMatch = goal.keywords.every(k => replyLower.includes(k.toLowerCase()));
          }
        }
        if (contactMatch && keywordMatch) {
          goal.done = true;
        }
      }
    }

    else if (goal.type === 'any_action') {
      // Goal: any action (timeline/todo/draft) mentioning specific keywords
      let matched = false;
      // Check action_results
      if (intent && intent.action_results) {
        for (const ar of intent.action_results) {
          if (!ar.ok) continue;
          const text = ((ar.summary || '') + ' ' + (ar.task || '') + ' ' + (ar.name || '')).toLowerCase();
          if (goal.keywords && goal.keywords.some(k => text.includes(k.toLowerCase()))) {
            matched = true;
          }
        }
      }
      // Also check if user's message or reply contains keywords + draft intent
      if (!matched && intent && intent.intent === 'draft') {
        if (goal.keywords && goal.keywords.some(k => replyLower.includes(k.toLowerCase()))) {
          matched = true;
        }
      }
      if (matched) {
        goal._count = (goal._count || 0) + 1;
        if (goal._count >= (goal.count || 1)) {
          goal.done = true;
        }
      }
    }
  }

  updateGoalTracker();

  const d = I18N[currentLang];

  // Check if a new goal was just completed (in sequential mode)
  if (isSequential) {
    const justCompleted = goalsToCheck.find(g => g.done && !g._announced);
    if (justCompleted) {
      justCompleted._announced = true;
      const nextGoal = simulationGoals.find(g => !g.done);
      if (nextGoal) {
        addMsg('ai', d.roleplay_goal_done
          .replace('{title}', justCompleted.title)
          .replace('{next_title}', nextGoal.title)
          .replace('{next_desc}', nextGoal.description));
      } else {
        // All goals done — generate coupon
        await rewardCoupon(simulationData, d, false);
      }
    }
  } else {
    // Non-sequential: check if all goals done
    if (simulationGoals.every(g => g.done)) {
      await rewardCoupon(simulationData, d, true);
    }
  }
}

async function rewardCoupon(simData, d, nonseq) {
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/create_coupon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: 100, scenario: simData.id }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      const msg = (nonseq ? d.roleplay_all_done_nonseq : d.roleplay_all_done)
        .replace('{avatar}', simData.avatar)
        .replace('{name}', simData.name)
        .replace('{code}', data.code)
        .replace('{points}', data.points);
      addMsg('ai', msg);
      // Also show a coupon card with copy button
      addMsg('ai', `${d.roleplay_coupon_title}\n\n**${d.roleplay_coupon_code}**: \`${data.code}\`\n${d.roleplay_coupon_points.replace('{points}', data.points)}\n${d.roleplay_coupon_hint}`);
      // Generate battle report card
      showBattleCard(simData, simulationGoals, data.code);
    } else {
      // Fallback: show completion without coupon
      addMsg('ai', `🎉 ${d.roleplay_all_done.replace('{avatar}', simData.avatar).replace('{name}', simData.name).replace('{code}', 'N/A').replace('{points}', 100)}`);
      showBattleCard(simData, simulationGoals, null);
    }
  } catch (e) {
    addMsg('ai', `🎉 ${d.roleplay_all_done.replace('{avatar}', simData.avatar).replace('{name}', simData.name).replace('{code}', 'N/A').replace('{points}', 100)}`);
    showBattleCard(simData, simulationGoals, null);
  }
}

// ── Battle report card (shareable image for role-play completion) ──

function showBattleCard(simData, goals, couponCode) {
  const completedGoals = goals.filter(g => g.done);
  const totalGoals = goals.length;
  const successRate = totalGoals > 0 ? Math.round(completedGoals.length / totalGoals * 100) : 100;

  // Extract a golden quote from conversation (last AI message)
  const chatBody = document.getElementById('chatBody');
  const aiMessages = chatBody.querySelectorAll('.msg.ai .msg-text');
  let goldenQuote = '';
  if (aiMessages.length > 0) {
    const lastFew = Array.from(aiMessages).slice(-5);
    for (const m of lastFew.reverse()) {
      const text = m.textContent || '';
      if (text.length > 15 && text.length < 120 && !text.includes('🎉') && !text.includes('奖券')) {
        goldenQuote = text.trim().slice(0, 100);
        break;
      }
    }
  }

  // Create canvas battle card
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 750, 420);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 750, 420);

  // Decorative border
  ctx.strokeStyle = '#e8c170';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 710, 380);

  // Avatar circle
  ctx.fillStyle = '#e8c170';
  ctx.beginPath();
  ctx.arc(80, 80, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(simData.avatar || '🎭', 80, 80);

  // Character name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(simData.name || '角色扮演', 140, 70);

  // Subtitle
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '14px sans-serif';
  ctx.fillText('Welian 角色扮演战报', 140, 95);

  // Stats
  ctx.fillStyle = '#e8c170';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${successRate}%`, 200, 180);
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.fillText('目标完成率', 200, 210);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(`${completedGoals.length}/${totalGoals}`, 400, 180);
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.fillText('完成目标', 400, 210);

  ctx.fillStyle = '#4ecdc4';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('100', 600, 180);
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.fillText('联点奖励', 600, 210);

  // Golden quote
  if (goldenQuote) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(40, 240, 670, 60);
    ctx.fillStyle = '#e8c170';
    ctx.font = 'italic 16px serif';
    ctx.textAlign = 'center';
    // Wrap text
    const words = goldenQuote.split('');
    let line = '';
    let y = 265;
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width > 630) {
        ctx.fillText(line, 375, y);
        line = w;
        y += 22;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, 375, y);
  }

  // Footer
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('welian.app · 每段关系都值得用心', 375, 370);

  if (couponCode) {
    ctx.fillStyle = '#e8c170';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`奖券码: ${couponCode}`, 375, 390);
  }

  // Convert to image and show in chat
  const dataUrl = canvas.toDataURL('image/png');
  const cardHtml = `
    <div style="margin-top:12px;border-radius:12px;overflow:hidden">
      <img src="${dataUrl}" style="width:100%;max-width:375px;border-radius:12px;display:block" alt="战报卡片">
      <div style="display:flex;gap:8px;margin-top:8px;justify-content:center">
        <button onclick="downloadBattleCard('${dataUrl.replace(/'/g, "\\'")}','${(simData.name||'battle').replace(/'/g,"")}')" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.85em">下载图片</button>
        <button onclick="shareBattleCard('${dataUrl.replace(/'/g, "\\'")}')" style="padding:8px 16px;background:none;border:1px solid var(--border);border-radius:8px;color:var(--dim);cursor:pointer;font-size:.85em">分享</button>
      </div>
    </div>
  `;
  addMsg('ai', cardHtml);
}

function downloadBattleCard(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `welian-${name}-战报.png`;
  a.click();
}

async function shareBattleCard(dataUrl) {
  if (navigator.share) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'welian-battle-card.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: 'Welian 战报', text: '我用 Welian 完成了角色扮演挑战！welian.app' });
    } catch (e) {
      // Fallback: copy link
      navigator.clipboard.writeText('https://welian.app').then(() => alert('链接已复制，去微信粘贴分享吧'));
    }
  } else {
    navigator.clipboard.writeText('https://welian.app').then(() => alert('链接已复制，去微信粘贴分享吧'));
  }
}

function exitSimulation() {
  simulationMode = false;
  simulationPersona = null;
  simulationData = null;
  simulationGoals = [];
  document.getElementById('goalTracker').style.display = 'none';
  clearChat();
  showWelcome();
  // Sign out any residual Clerk session before showing sign-up
  if (isAuthed && clerkInstance) {
    clerkInstance.signOut();
    onSignedOut();
  }
  // Show auth modal with sign-up (not sign-in) for new users
  isAuthed = false; // ensure toggleAuth doesn't treat this as sign-out
  toggleAuth('signup');
}

async function autoConnectAgent() {
  console.log('autoConnectAgent called, clerkUserId:', clerkUserId);

  // Cloud-first: immediately enter cloud mode so user can chat right away
  enableCloudMode();

  // Fetch routing config (mode, timeouts) from cloud
  fetchRoutingConfig();

  // Background: try to find local agent and upgrade to Live mode
  tryUpgradeToLive();
}

async function tryUpgradeToLive() {
  // Phase 1: try direct tunnel URL
  console.log('[tryUpgradeToLive] trying direct tunnel:', AGENT_TUNNEL_URL);
  try {
    const result = await tryBridgeConnect(AGENT_TUNNEL_URL, 'tunnel');
    console.log('[tryUpgradeToLive] tunnel result:', result);
    if (result === 'auth_ok') {
      upgradeToLive('tunnel');
      return;
    }
  } catch(e) {
    console.log('[tryUpgradeToLive] tunnel failed:', e.message);
  }

  // Phase 2: try discovery service
  if (clerkUserId) {
    console.log('[tryUpgradeToLive] looking up tunnel via discovery…');
    try {
      const resp = await fetch(`${DISCOVERY_URL}/discover/lookup?user_id=${clerkUserId}`);
      const data = await resp.json();
      if (data.found && data.tunnel_url && data.tunnel_url !== AGENT_TUNNEL_URL) {
        console.log('[tryUpgradeToLive] found tunnel:', data.tunnel_url);
        const result = await tryBridgeConnect(data.tunnel_url, 'discovery');
        console.log('[tryUpgradeToLive] discovery result:', result);
        if (result === 'auth_ok') {
          upgradeToLive('discovery');
          return;
        }
      }
    } catch(e) {
      console.log('[tryUpgradeToLive] discovery failed:', e.message);
    }
  }

  // No local agent found — stay in cloud mode (already enabled)
  // Keep bridgeFrame alive — bridge WebSocket might connect later
  console.log('[tryUpgradeToLive] no agent found yet, staying in cloud mode');
}

function upgradeToLive(source) {
  // Agent bridge is connected. Keep bridge alive for data-aware chat.
  // Switch routing: subsequent send() will use bridge (agent has data context).
  isCloud = false;
  isLive = true;
  // Register bridge message listener to receive agent replies
  window.addEventListener('message', onBridgeMessage);
  // Update status badge
  statusDot.className = 'status-dot online';
  statusText.textContent = 'Live';
  if (modeBadge) { modeBadge.textContent = 'Live'; modeBadge.className = 'mode-badge live'; }

  const chatMessages = body.querySelectorAll('.msg:not(.system)');
  if (chatMessages.length > 0) {
    // User already has conversation — don't disrupt
    console.log('Agent online — switching to data-aware mode (bridge kept)');
  } else {
    // No conversation yet — replace cloud welcome with Live welcome (no clearChat flash)
    console.log('Agent online — replacing cloud welcome with Live welcome');
    // Remove cloud welcome system message, add Live welcome
    const systemMsgs = body.querySelectorAll('.msg');
    systemMsgs.forEach(m => m.remove());
    addMsg('ai', I18N[currentLang].live_welcome);
  }

  // Show agent config panel in sidebar (Live mode only)
  const panel = document.getElementById('agentConfigPanel');
  if (panel) {
    panel.style.display = 'block';
    loadAgentConfigToUI();
  }

  // Auto-restore engine from agent config (in case we fell back to cloud earlier)
  // This ensures that after a bridge reconnect, we use the configured engine again
  // instead of staying on cloud LLM permanently.
  if (!window._agentEngine) {
    console.log('[upgradeToLive] No engine set, loading from agent config');
    loadAgentConfigToUI();
  } else {
    console.log('[upgradeToLive] Engine already set:', window._agentEngine);
  }
}

// ── Agent config panel controls ──
async function loadAgentConfigToUI() {
  const cfg = await agentConfig('get');
  if (!cfg || cfg.error) {
    console.log('[agentConfig] load failed:', cfg?.message || 'no response');
    return;
  }
  const data = cfg.data || {};
  window._agentEngine = data.engine || 'edge';
  const engineSelect = document.getElementById('agentEngineSelect');
  if (engineSelect) engineSelect.value = data.engine || 'edge';
  onAgentEngineChange(data.engine || 'edge');
  const devin = data.devin || {};
  const modelInput = document.getElementById('devinModelInput');
  if (modelInput) modelInput.value = devin.model || '';
  const permSelect = document.getElementById('devinPermissionSelect');
  if (permSelect) permSelect.value = devin.permission_mode || 'dangerous';
  const maxTurnsInput = document.getElementById('devinMaxTurnsInput');
  if (maxTurnsInput) maxTurnsInput.value = devin.max_turns || 50;
  const timeoutInput = document.getElementById('devinTimeoutInput');
  if (timeoutInput) timeoutInput.value = devin.timeout || 600;
}

function toggleAgentConfig() {
  const body = document.getElementById('agentConfigBody');
  const toggle = document.getElementById('agentConfigToggle');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (toggle) toggle.textContent = isOpen ? '▸' : '▾';
}

function onAgentEngineChange(engine) {
  const devinFields = document.getElementById('devinConfigFields');
  if (devinFields) devinFields.style.display = engine === 'devin' ? 'block' : 'none';
}

async function saveAgentConfig() {
  const engine = document.getElementById('agentEngineSelect')?.value || 'edge';
  const config = { engine };
  if (engine === 'devin') {
    config.devin = {
      model: document.getElementById('devinModelInput')?.value || '',
      permission_mode: document.getElementById('devinPermissionSelect')?.value || 'dangerous',
      max_turns: parseInt(document.getElementById('devinMaxTurnsInput')?.value || '50', 10),
      timeout: parseInt(document.getElementById('devinTimeoutInput')?.value || '600', 10),
    };
  }
  const result = await agentConfig('set', config);
  if (result && result.ok) {
    window._agentEngine = engine;
    addMsg('ai', `✅ Agent 引擎已切换为 ${engine === 'devin' ? 'Devin CLI' : 'Edge (本地 LLM)'}${engine === 'devin' && config.devin.model ? ' (模型: ' + config.devin.model + ')' : ''}`);
  } else if (result && result.error) {
    addMsg('ai', `⚠️ 配置保存失败：${result.message}\n请重启本地 agent（welian agent）后重试`);
  } else {
    addMsg('ai', '⚠️ 配置保存失败，请确认本地 agent 已连接');
  }
}

function tryBridgeConnect(url, label) {
  return new Promise((resolve) => {
    let resolved = false;
    let iframeLoaded = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`${label}: TIMEOUT after 8s. iframeLoaded=${iframeLoaded}`);
        // Don't remove iframe — it might connect later
        // Register late-auth listener for delayed bridge connection
        if (!bridgeReady) {
          const lateHandler = (e) => {
            const msg = e.data;
            if (!msg || msg.source !== 'welian-bridge') return;
            if (msg.type === 'ws-message' && msg.data && msg.data.type === 'auth_ok') {
              console.log(`${label}: LATE auth_ok received!`);
              bridgeReady = true;
              window.removeEventListener('message', lateHandler);
              upgradeToLive('late-' + label);
            }
          };
          window.addEventListener('message', lateHandler);
        }
        resolve('no_bridge');
      }
    }, 8000);

    // Create hidden iframe — agent injects token into the page
    bridgeFrame = document.createElement('iframe');
    bridgeFrame.style.display = 'none';
    bridgeFrame.src = url + (clerkUserId ? '?clerk_uid=' + encodeURIComponent(clerkUserId) : '');

    // Detect iframe load
    bridgeFrame.onload = () => { iframeLoaded = true; console.log(`${label}: iframe loaded`); };

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;

      if (msg.type === 'ready') {
        console.log(`${label}: bridge ready`);
      } else if (msg.type === 'device-id') {
        console.log(`${label}: device_id=${msg.device_id}`);
        if (clerkUserId && msg.device_id) {
          fetch(`${DISCOVERY_URL}/discover/link`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({user_id: clerkUserId, device_id: msg.device_id}),
          }).then(r=>r.json()).then(d=>{
            console.log('Linked device to user:', d);
          }).catch(e=>console.log('Link failed:', e));
        }
      } else if (msg.type === 'ws-message' && !resolved) {
        const data = msg.data;
        console.log(`${label}: ws-message`, data.type);
        if (data.type === 'auth_ok') {
          resolved = true;
          clearTimeout(timeout);
          bridgeReady = true;
          window.removeEventListener('message', handler);
          resolve('auth_ok');
        } else if (data.type === 'error') {
          resolved = true;
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve('no_bridge');
        }
      } else if (msg.type === 'ws-error' && !resolved) {
        console.log(`${label}: ws-error`);
        resolved = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve('no_bridge');
      } else if (msg.type === 'log' && !resolved) {
        console.log(`${label}: [bridge]`, msg.message);
      }
    };
    window.addEventListener('message', handler);

    bridgeFrame.onerror = () => {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve('no_bridge'); }
    };

    document.body.appendChild(bridgeFrame);
  });
}

function onAgentConnected(port) {
  isLive = true;
  if (modeBadge) { modeBadge.textContent = 'Live'; modeBadge.className = 'mode-badge live'; }
  statusDot.className = 'status-dot online';
  statusText.textContent = 'Connected';

  // Listen for messages from bridge (use named function so we can debug)
  window.addEventListener('message', onBridgeMessage);

  clearChat();
  addMsg('ai', I18N[currentLang].connected);
}

function onBridgeMessage(e) {
  const msg = e.data;
  if (!msg || msg.source !== 'welian-bridge') return;

  if (msg.type === 'ws-message') {
    const data = msg.data;
    // Ignore context/save_turn/search responses (handled by their own listeners)
    if (data.id && (data.id.startsWith('ctx_') || data.id.startsWith('save_') || data.id.startsWith('sch_'))) return;
    // Ignore auth_ok (handled in tryBridgeConnect)
    if (data.type === 'auth_ok') return;
    // No other ws-message types expected in cloud-first mode
    console.log('Bridge ws-message (unhandled):', data.type, data.id);
  } else if (msg.type === 'ws-close') {
    console.log('Bridge ws-close — falling back to cloud-only mode');
    isLive = false;
    bridgeReady = false;
    removeBridge();
    // Restore cloud mode so user can still chat (fix: was leaving isCloud=false + isLive=false)
    if (!isCloud && isAuthed) {
      isCloud = true;
      statusDot.className = 'status-dot online';
      statusText.textContent = I18N[currentLang].cloud_status;
      if (modeBadge) { modeBadge.textContent = 'Cloud'; modeBadge.className = 'mode-badge live'; }
    }
    if (isCloud) {
      addSystemMsg(I18N[currentLang].cloud_status + ' (agent offline)');
    }
    // Auto-retry: attempt to reconnect bridge every 15s, restore engine on success
    // Uses setTimeout recursion (not setInterval) to avoid overlapping attempts
    if (!window._bridgeReconnectTimer) {
      console.log('[bridge] Starting auto-reconnect (every 15s)');
      const attemptReconnect = async () => {
        if (bridgeReady) {
          window._bridgeReconnectTimer = null;
          console.log('[bridge] Already connected — stopping retry');
          return;
        }
        // Clean up any orphaned iframe from previous failed attempt
        removeBridge();
        console.log('[bridge] Auto-reconnect attempt...');
        try {
          const result = await tryBridgeConnect(AGENT_TUNNEL_URL, 'reconnect');
          if (result === 'auth_ok') {
            window._bridgeReconnectTimer = null;
            // Must call upgradeToLive — tryBridgeConnect does NOT call it
            upgradeToLive('reconnect');
            console.log('[bridge] Reconnected — upgradeToLive called, engine restored from config');
            return;
          }
          // Clean up orphaned iframe on failed attempt
          removeBridge();
        } catch (e) {
          console.log('[bridge] Reconnect failed:', e.message);
          removeBridge();
        }
        // Schedule next attempt
        window._bridgeReconnectTimer = setTimeout(attemptReconnect, 15000);
      };
      window._bridgeReconnectTimer = setTimeout(attemptReconnect, 15000);
    }
  }
}

// ── Chat ──

function hideWelcome() {
  if (welcomeState) {
    welcomeState.classList.add('hidden');
  }
}

function showWelcome() {
  if (welcomeState) {
    welcomeState.classList.remove('hidden');
  }
}

function scrollToBottom() {
  // Scroll the main container (layout changed: main is scroll container, not chatBody)
  const scrollEl = document.querySelector('#chatMain main') || body;
  scrollEl.scrollTop = scrollEl.scrollHeight;
  requestAnimationFrame(() => { scrollEl.scrollTop = scrollEl.scrollHeight; });
}

function addMsg(who, text) {
  hideWelcome();
  let displayText = text;
  let aiSuggestions = null;
  if (who === 'ai') {
    // Extract <<<SUGGESTIONS>>> block from AI reply
    const marker = '<<<SUGGESTIONS>>>';
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      displayText = text.substring(0, idx).trim();
      const sugBlock = text.substring(idx + marker.length).trim();
      aiSuggestions = sugBlock.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('```'));
      if (aiSuggestions.length === 0) aiSuggestions = null;
    }
  }
  const d = document.createElement('div');
  d.className = 'msg';
  const label = who === 'ai' ? 'Welian' : 'You';
  d.innerHTML = '<div class="who ' + who + '">' + label + '</div><div class="bubble ' + who + '">' + escapeHtml(displayText) + '</div>';
  body.appendChild(d);
  // F9: Add quick actions to AI messages
  if (who === 'ai') {
    addMsgActions(d, displayText);
    // Store AI-generated suggestions for addSuggestions to use
    if (aiSuggestions) window._lastAiSuggestions = aiSuggestions;
  }
  scrollToBottom();
}

function addSystemMsg(text) {
  hideWelcome();
  const d = document.createElement('div');
  d.className = 'msg';
  d.innerHTML = '<div class="bubble system">' + escapeHtml(text) + '</div>';
  body.appendChild(d);
  scrollToBottom();
}

function addTyping() {
  hideWelcome();
  const d = document.createElement('div');
  d.className = 'msg';
  d.id = 'typing';
  d.innerHTML = '<div class="who ai">Welian</div><div class="bubble ai"><span class="typing"></span></div>';
  body.appendChild(d);
  scrollToBottom();
}

function removeTyping() {
  document.getElementById('typing')?.remove();
  scrollToBottom();
}

// Build dynamic suggestions for logged-in users based on their real contacts + todos
async function buildUserSuggestions() {
  const token = await getClerkToken();
  if (!token) return ['有什么待办？', '该联系谁？', '帮我拟一条消息', '月度回顾'];

  let topContact = '';
  let overdueTodoContact = '';

  try {
    // Fetch contacts + timeline — pick most recently interacted contact
    const [cResp, tlResp] = await Promise.all([
      fetch(`${CLOUD_URL}/data/contacts`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${CLOUD_URL}/data/timeline`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null),
    ]);
    if (cResp.ok) {
      const cData = await cResp.json();
      const contacts = cData.contacts || [];
      // Try to find most recently interacted contact from timeline
      if (tlResp && tlResp.ok) {
        const tlData = await tlResp.json();
        const timeline = (tlData.timeline || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        for (const t of timeline) {
          const c = contacts.find(c => c.id === t.contact);
          if (c) { topContact = c.name; break; }
        }
      }
      // Fallback: first contact
      if (!topContact && contacts.length > 0) topContact = contacts[0].name || '';
    }
  } catch (e) { /* ignore */ }

  try {
    // Fetch todos — find overdue/urgent ones
    const tResp = await fetch(`${CLOUD_URL}/data/todos`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (tResp.ok) {
      const tData = await tResp.json();
      const todos = tData.todos || [];
      const today = localDateStr();
      const overdue = todos.find(t => {
        const due = (t.due || '').substring(0, 10);
        return due && new Date(due) <= new Date(today);
      });
      if (overdue) overdueTodoContact = overdue.contact || '';
    }
  } catch (e) { /* ignore */ }

  // Build suggestions from real data
  const suggestions = [];
  if (overdueTodoContact) {
    suggestions.push(`帮我给 ${overdueTodoContact} 写条消息`);
  } else if (topContact) {
    suggestions.push(`帮我给 ${topContact} 写条消息`);
  } else {
    suggestions.push('帮我拟一条消息');
  }

  suggestions.push('有什么待办？');

  if (topContact) {
    suggestions.push(`记一下今天和 ${topContact} 的互动`);
  } else {
    suggestions.push('该联系谁？');
  }

  suggestions.push('月度回顾');

  return suggestions.slice(0, 4);
}

// Context-aware suggestions: parse AI reply for contact names and intent
async function buildContextAwareSuggestions(aiReply) {
  const zh = currentLang === 'zh';
  const fallback = await buildUserSuggestions();

  if (!aiReply) return fallback;

  // Find contacts mentioned in the AI reply
  const contacts = chatDataCache.contacts || [];
  // For short names (≤2 chars), require word-boundary match to avoid false positives
  // e.g. "金" should not match inside "今天" or "金钱"
  const mentioned = contacts.filter(c => {
    if (!c.name) return false;
    if (c.name.length <= 2) {
      // Use regex word-boundary for CJK: match as standalone, not inside other words
      // For CJK, check that surrounding chars are not common word continuations
      const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^\\u4e00-\\u9fff])${escaped}([^\\u4e00-\\u9fff]|$)`, 'u');
      return re.test(aiReply);
    }
    return aiReply.includes(c.name);
  }).map(c => c.name);

  const suggestions = [];

  // Detect user's intent from LAST message only (not full history)
  // Using full history caused stale intent — e.g. once "draft" was mentioned,
  // all subsequent suggestions stayed in draft mode forever
  const allUserMsgs = [...document.querySelectorAll('.msg .who.you')].map(el => el.nextElementSibling?.textContent || '');
  const lastUserMsg = allUserMsgs[allUserMsgs.length - 1] || '';
  const askedWhoToContact = /该联系谁|谁.*联系|who.*contact|who.*reach/i.test(lastUserMsg);
  const askedTodos = /待办|todo|任务/i.test(lastUserMsg);
  const askedDraft = /拟.*消息|写.*消息|draft.*message/i.test(lastUserMsg);
  const askedContactInfo = /详细信息|互动记录|详情|details|last.*interaction/i.test(lastUserMsg);

  // If AI mentioned specific contacts, offer actions on them
  if (mentioned.length > 0) {
    const firstContact = mentioned[0];
    const secondContact = mentioned[1] || '';
    const thirdContact = mentioned[2] || '';

    if (askedWhoToContact) {
      // Conversation started from "who to contact" — ALL suggestions about mentioned contacts
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`${firstContact}最近有什么互动记录？`);
        if (thirdContact) suggestions.push(`帮我给${thirdContact}写条消息`);
        else if (secondContact) suggestions.push(`${firstContact}最近有什么互动记录？`);
        else suggestions.push(`${firstContact}的详细信息`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`what's the last interaction with ${firstContact}?`);
        if (thirdContact) suggestions.push(`draft a message to ${thirdContact}`);
        else if (secondContact) suggestions.push(`what's the last interaction with ${firstContact}?`);
        else suggestions.push(`${firstContact}'s details`);
      }
    } else if (askedDraft) {
      // User asked to draft — offer to record or refine
      if (zh) {
        suggestions.push(`记一下今天和${firstContact}的互动`);
        suggestions.push(`再写一版更正式的`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`${firstContact}的详细信息`);
        suggestions.push(`再写一版更轻松的`);
      } else {
        suggestions.push(`note: interacted with ${firstContact} today`);
        suggestions.push(`write a more formal version`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`${firstContact}'s details`);
        suggestions.push(`write a more casual version`);
      }
    } else if (askedContactInfo) {
      // User asked about contact details — offer actions on this contact
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        suggestions.push(`记一下今天和${firstContact}的互动`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`这周该联系谁？`);
        suggestions.push(`${firstContact}有什么待办？`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        suggestions.push(`note: met with ${firstContact} today`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`who should I contact this week?`);
        suggestions.push(`any todos for ${firstContact}?`);
      }
    } else if (askedTodos) {
      // User asked about todos — follow up on the todo-related contact
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        suggestions.push(`${firstContact}最近有什么互动记录？`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`${firstContact}的详细信息`);
        suggestions.push(`推迟这个待办`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        suggestions.push(`what's the last interaction with ${firstContact}?`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`${firstContact}'s details`);
        suggestions.push(`postpone this todo`);
      }
    } else {
      // Default: all suggestions about mentioned contacts
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`记一下今天和${firstContact}的互动`);
        if (thirdContact) suggestions.push(`帮我给${thirdContact}写条消息`);
        else if (secondContact) suggestions.push(`${firstContact}最近有什么互动记录？`);
        else suggestions.push(`${firstContact}的详细信息`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`note: met with ${firstContact} today`);
        if (thirdContact) suggestions.push(`draft a message to ${thirdContact}`);
        else if (secondContact) suggestions.push(`what's the last interaction with ${firstContact}?`);
        else suggestions.push(`${firstContact}'s details`);
      }
    }
  } else {
    // No contacts mentioned — use fallback
    return fallback;
  }

  return suggestions.slice(0, 4);
}

// Add clickable suggestion chips after AI reply
async function addSuggestions(aiReply) {
  let suggestions = [];

  if (simulationMode && simulationData) {
    // Simulation: suggestions based on current scenario + current goal
    const currentGoal = simulationGoals.find(g => !g.done);

    if (currentGoal) {
      if (currentGoal.type === 'record_interaction') {
        const contact = currentGoal.contact_names?.[0] || '';
        suggestions = [
          '有什么待办？',
          `记一下今天和 ${contact} 聊了关于${currentGoal.keywords?.[0] || '工作'}的事`,
          `帮我给 ${contact} 写条消息`,
        ];
      } else if (currentGoal.type === 'draft_message') {
        const contact = currentGoal.contact_names?.[0] || '';
        suggestions = [
          '有什么待办？',
          `帮我给 ${contact || '团队'} 写一条消息`,
          '该联系谁？',
        ];
      } else {
        suggestions = ['有什么待办？', '该联系谁？', '帮我拟一条消息'];
      }
    } else {
      suggestions = ['有什么待办？', '该联系谁？', '月度回顾'];
    }
  } else {
    // Logged-in user: prefer AI-generated suggestions, fall back to data-based
    if (window._lastAiSuggestions && window._lastAiSuggestions.length > 0) {
      suggestions = window._lastAiSuggestions.slice(0, 4);
      window._lastAiSuggestions = null; // consume
    } else {
      suggestions = await buildUserSuggestions();
    }
  }

  // Append chips inside the last AI message bubble (natural extension of reply)
  const aiMsgs = body.querySelectorAll('.msg .who.ai');
  const lastAiMsg = aiMsgs.length ? aiMsgs[aiMsgs.length - 1].closest('.msg') : null;
  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'suggestion-chips';
  chipsDiv.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;';
  suggestions.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'suggestion-chip';
    chip.textContent = s;
    chip.style.cssText = 'padding:4px 11px;border:1px solid var(--border);border-radius:12px;background:transparent;color:var(--dim);font-size:.76em;cursor:pointer;transition:all .15s;font-family:inherit;';
    chip.onmouseenter = () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; };
    chip.onmouseleave = () => { chip.style.borderColor = 'var(--border)'; chip.style.color = 'var(--dim)'; };
    chip.onclick = () => { input.value = s; send(); };
    chipsDiv.appendChild(chip);
  });
  if (lastAiMsg) {
    lastAiMsg.appendChild(chipsDiv);
  } else {
    chipsDiv.style.margin = '0 0 16px';
    body.appendChild(chipsDiv);
  }
  scrollToBottom();
}

function clearChat() {
  body.innerHTML = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Chat file upload ──
let pendingChatFile = null; // { base64, filename, mediaType, isImage }

async function handleChatFile(file) {
  if (!file) return;
  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    alert('文件不能超过 10MB');
    document.getElementById('chatFileInput').value = '';
    return;
  }
  const lowerName = file.name.toLowerCase();
  const isImage = lowerName.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/);
  let mediaType = file.type || 'application/octet-stream';
  // Ensure correct media types for common formats
  if (lowerName.endsWith('.pdf')) mediaType = 'application/pdf';
  else if (lowerName.endsWith('.xlsx')) mediaType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  else if (lowerName.endsWith('.xls')) mediaType = 'application/vnd.ms-excel';
  else if (lowerName.endsWith('.docx')) mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (lowerName.endsWith('.doc')) mediaType = 'application/msword';
  else if (lowerName.endsWith('.png')) mediaType = 'image/png';
  else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mediaType = 'image/jpeg';
  else if (lowerName.endsWith('.gif')) mediaType = 'image/gif';
  else if (lowerName.endsWith('.bmp')) mediaType = 'image/bmp';
  else if (lowerName.endsWith('.webp')) mediaType = 'image/webp';

  try {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    pendingChatFile = { base64, filename: file.name, mediaType, isImage: !!isImage };
    // Show preview
    const preview = document.getElementById('chatFilePreview');
    const nameEl = document.getElementById('chatFileName');
    if (preview && nameEl) {
      nameEl.textContent = `📎 ${file.name}`;
      preview.style.display = 'flex';
    }
  } catch (e) {
    alert('文件读取失败: ' + e.message);
  }
  document.getElementById('chatFileInput').value = '';
}

function clearChatFile() {
  pendingChatFile = null;
  const preview = document.getElementById('chatFilePreview');
  if (preview) preview.style.display = 'none';
}

async function send() {
  const text = input.value.trim();
  const file = pendingChatFile;
  if (!text && !file) return;
  input.value = '';

  // Show user message with file indicator
  let displayText = text;
  if (file) displayText = (text ? text + ' ' : '') + `📎 ${file.filename}`;
  addMsg('you', displayText);
  addTyping();
  clearChatFile();

  // H5: Show stop button while generating
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = '';

  if (isCloud || isLive || simulationMode) {
    // Unified cloud-first flow: cloudChat handles both cases
    // - If agent bridge is available: gets edge data context, then calls cloud LLM
    // - If no agent: calls cloud LLM directly (no data context)
    try {
      const reply = await cloudChat(text, file);
      removeTyping();
      addMsg('ai', reply);
      addSuggestions(reply);
    } catch (e) {
      removeTyping();
      if (e.name === 'AbortError') {
        addMsg('ai', '已停止生成。');
      } else {
        addMsg('ai', I18N[currentLang].cloud_error + e.message);
      }
    }
  } else if (isAuthed) {
    // Fix: authed user whose isCloud/isLive were reset (e.g. agent disconnect) — auto-restore cloud mode
    isCloud = true;
    statusDot.className = 'status-dot online';
    statusText.textContent = I18N[currentLang].cloud_status;
    try {
      const reply = await cloudChat(text, file);
      removeTyping();
      addMsg('ai', reply);
      addSuggestions(reply);
    } catch (e) {
      removeTyping();
      if (e.name === 'AbortError') {
        addMsg('ai', '已停止生成。');
      } else {
        addMsg('ai', I18N[currentLang].cloud_error + e.message);
      }
    }
  } else {
    // Not connected — prompt to sign in
    removeTyping();
    addMsg('ai', I18N[currentLang].signin_prompt);
  }

  // H5: Restore send button
  if (sendBtn) sendBtn.style.display = '';
  if (stopBtn) stopBtn.style.display = 'none';
  chatAbortController = null;
}

// H5: Stop in-progress chat
function stopChat() {
  if (chatAbortController) {
    chatAbortController.abort();
    console.log('[stopChat] Aborted by user');
  }
}

function quickSend(text) {
  input.value = text;
  send();
}

function quickNote() {
  hideWelcome();
  input.value = 'note: ';
  input.focus();
  input.setSelectionRange(6, 6);
}

function quickDraft() {
  hideWelcome();
  input.value = 'draft a message to ';
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

function quickDraftTo(name) {
  const zh = currentLang === 'zh';
  hideWelcome();
  input.value = zh ? `帮我给${name}写条消息` : `draft a message to ${name}`;
  input.focus();
  send();
}

// ═══════════════════════════════════════════════
// F1-F9: Chat page enhancements
// ═══════════════════════════════════════════════

let chatDataCache = { contacts: [], todos: [], timeline: [] };

// Master loader — called from onAuthed
async function loadChatEnhancements() {
  if (!isAuthed) return;
  try {
    const [contactsRes, todosRes, timelineRes] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    chatDataCache = {
      contacts: contactsRes.contacts || [],
      todos: todosRes.todos || [],
      timeline: timelineRes.timeline || [],
    };
    // Also populate mineCache.contacts so openContactDetail works from chat view
    mineCache.contacts = chatDataCache.contacts;
    // F1: Daily dashboard
    renderDailyDashboard();
    // F4: Reminder card
    showReminderCard();
  } catch (e) {
    console.log('[loadChatEnhancements] data load failed:', e.message);
  }
  // Always render right sidebar (even with empty data, shows empty states)
  renderDesktopSidebar();
  // F2: Quick actions (show for logged-in users)
  document.getElementById('quickActions').style.display = 'none';
  // F3: Tab badges
  updateTabBadges();
  // F4b: Proactive AI suggestions
  fetchProactiveSuggestions();
  // F7: Empty state
  toggleEmptyState();
  // Warmth elements (only show on welcome screen)
  showWarmthQuote();
  showStreakBadge();
}

// ── F1: Daily dashboard ──
function renderDailyDashboard() {
  const { contacts, todos, timeline } = chatDataCache;
  if (!contacts.length) return;
  const el = document.getElementById('dailyDashboard');
  const zh = currentLang === 'zh';
  const now = new Date();
  const todayStr = localDateStr(now);

  // Overdue todos (show max 3, most overdue first)
  const overdueTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) < todayStr)
    .sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 3);
  const todayTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) === todayStr);

  // Contacts not contacted in 14+ days (leverage only, not nurture)
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  const lastContact = {};
  timeline.forEach(t => { if (t.contact) lastContact[t.contact] = t.date; });
  const staleContacts = contacts
    .filter(c => c.nature === 'leverage' || c.nature === 'dual')
    .filter(c => {
      const snooze = c.snooze_until;
      if (snooze && snooze.substring(0, 10) > todayStr) return false;
      return true;
    })
    .map(c => {
      const last = lastContact[c.id];
      if (!last) return { c, days: 999 };
      const days = Math.floor((new Date(todayStr) - new Date((last || '').substring(0, 10))) / 86400000);
      return { c, days };
    })
    .filter(x => x.days >= 14)
    .sort((a, b) => b.days - a.days)
    .slice(0, 3);

  // Upcoming important dates (next 30 days)
  const upcomingDates = [];
  contacts.forEach(c => {
    (c.important_dates || []).forEach(dt => {
      const dateStr = dt.date || '';
      if (dateStr.length >= 5) {
        const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
        const thisYear = `${now.getFullYear()}-${mmdd}`;
        const dDate = new Date(thisYear);
        const delta = Math.floor((dDate - now) / 86400000);
        if (delta >= 0 && delta <= 30) {
          upcomingDates.push({ name: c.name, date: mmdd, label: dt.label || '', delta, contactId: c.id });
        }
      }
    });
  });
  upcomingDates.sort((a, b) => a.delta - b.delta);

  let inner = '';
  const hasContent = overdueTodos.length || todayTodos.length || staleContacts.length || upcomingDates.length;
  const totalCount = overdueTodos.length + todayTodos.length + staleContacts.length + upcomingDates.length;

  if (!hasContent) {
    inner += `<div class="dashboard-card"><div class="dashboard-empty">${zh ? '✨ 今日无待办，关系都在路上' : '✨ All caught up today'}</div></div>`;
  } else {
    if (overdueTodos.length || todayTodos.length) {
      inner += `<div class="dashboard-card" onclick="openMine();setTimeout(()=>switchMineTab('todos'),100)">`;
      inner += `<div class="dashboard-card-title">✅ ${zh ? '今日待办' : 'Today\'s Todos'}</div>`;
      todayTodos.forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        inner += `<div class="dashboard-item"><span class="icon">📌</span><span class="text">${escapeHtml((t.task||'').substring(0,40))}${name?' ['+escapeHtml(name)+']':''}</span><span class="badge">${zh?'今天':'Today'}</span></div>`;
      });
      overdueTodos.forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        inner += `<div class="dashboard-item"><span class="icon">⚠️</span><span class="text">${escapeHtml((t.task||'').substring(0,40))}${name?' ['+escapeHtml(name)+']':''}</span><span class="badge urgent">${zh?'超期':'Overdue'}</span></div>`;
      });
      inner += `</div>`;
    }
    if (staleContacts.length) {
      inner += `<div class="dashboard-card">`;
      inner += `<div class="dashboard-card-title" onclick="event.stopPropagation();openMine();setTimeout(()=>switchMineTab('contacts'),100)" style="cursor:pointer">🌿 ${zh ? '该联系了' : 'Time to Reconnect'}</div>`;
      staleContacts.forEach(x => {
        const days = x.days === 999 ? (zh?'从未联系':'never') : `${x.days}${zh?'天':'d'}`;
        inner += `<div class="dashboard-item" style="cursor:pointer" onclick="event.stopPropagation();quickDraftTo('${escapeHtml(x.c.name).replace(/'/g,"\\'")}')"><span class="icon">🔄</span><span class="text">${escapeHtml(x.c.name)}</span><span class="badge">${days}</span><button onclick="event.stopPropagation();snoozeContact('${escapeHtml(x.c.id)}','${escapeHtml(x.c.name).replace(/'/g,"\\'")}')" style="font-size:.65em;padding:1px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--dimmer);cursor:pointer;margin-left:4px;white-space:nowrap">${zh?'暂不':'snooze'}</button></div>`;
      });
      inner += `</div>`;
    }
    if (upcomingDates.length) {
      inner += `<div class="dashboard-card" onclick="openMine();setTimeout(()=>switchMineTab('overview'),100)">`;
      inner += `<div class="dashboard-card-title">📅 ${zh ? '近期重要日期' : 'Upcoming Dates'}</div>`;
      upcomingDates.slice(0, 3).forEach(dt => {
        const deltaLabel = dt.delta === 0 ? (zh?'今天':'today') : `${dt.delta}${zh?'天后':'d'}`;
        inner += `<div class="dashboard-item"><span class="icon">🎂</span><span class="text">${escapeHtml(dt.name)} — ${escapeHtml(dt.label||dt.date)}</span><span class="badge">${deltaLabel}</span></div>`;
      });
      inner += `</div>`;
    }
  }
  // Compact toggle bar + expandable inner
  const summaryParts = [];
  if (overdueTodos.length) summaryParts.push(`${overdueTodos.length}${zh?'超期':'overdue'}`);
  if (todayTodos.length) summaryParts.push(`${todayTodos.length}${zh?'今天':'today'}`);
  if (staleContacts.length) summaryParts.push(`${staleContacts.length}${zh?'该联系':'stale'}`);
  if (upcomingDates.length) summaryParts.push(`${upcomingDates.length}${zh?'日期':'dates'}`);
  const summary = summaryParts.join(' · ') || (zh ? '一切就绪' : 'All good');

  el.innerHTML = `
    <div class="dashboard-toggle" onclick="toggleDashboard()">
      <span>📋 ${zh ? '今日关系看板' : 'Today\'s Dashboard'}</span>
      <span class="count">${totalCount}</span>
      <span style="color:var(--dimmer);font-size:.9em">${summary}</span>
      <span class="arrow">▾</span>
    </div>
    <div class="dashboard-inner">${inner}</div>
  `;
  el.classList.add('daily-dashboard');
  el.style.display = 'block';
  // On desktop (≥1200px), auto-expand the left panel
  if (window.innerWidth >= 1200) el.classList.add('expanded');
}
function toggleDashboard() {
  const el = document.getElementById('dailyDashboard');
  el.classList.toggle('expanded');
}

async function snoozeContact(contactId, contactName) {
  const zh = currentLang === 'zh';
  const days = 30;
  const snoozeUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  try {
    await mineApi('/data/contacts', 'POST', { id: contactId, name: contactName, snooze_until: snoozeUntil });
    // Update cache
    const c = (chatDataCache.contacts || []).find(c => c.id === contactId);
    if (c) c.snooze_until = snoozeUntil;
    const mc = (mineCache.contacts || []).find(c => c.id === contactId);
    if (mc) mc.snooze_until = snoozeUntil;
    // Re-render right sidebar
    renderDesktopSidebar();
  } catch (e) {
    alert((zh ? '操作失败：' : 'Failed: ') + e.message);
  }
}

// ── F2: Quick actions ──
function quickAction(type) {
  const zh = currentLang === 'zh';
  const prompts = {
    record: zh ? '记一下今天和' : 'note: today I met with ',
    who: zh ? '该联系谁了？' : 'who should I contact?',
    draft: zh ? '帮我给' : 'draft a message to ',
    weekly: zh ? '这周总结' : 'weekly summary',
  };
  const prefix = prompts[type] || prompts.record;
  hideWelcome();
  input.value = prefix;
  input.focus();
  if (type === 'record' || type === 'draft') {
    input.setSelectionRange(prefix.length, prefix.length);
  } else {
    send();
  }
}

// ── F3: Tab badges ──
function updateTabBadges() {
  const { todos, timeline } = chatDataCache;
  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  // Todos badge: count overdue
  const overdueCount = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) < todayStr).length;
  const todosBadge = document.getElementById('tabBadgeTodos');
  if (todosBadge) todosBadge.innerHTML = overdueCount > 0 ? `<span class="tab-badge"></span>` : '';
  // Weekly badge: show on Monday or if no weekly report this week
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - day);
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const hasWeeklyThisWeek = timeline.some(t => (t.date || '').substring(0, 10) >= weekStartStr && (t.summary || '').includes('周报'));
  const weeklyBadge = document.getElementById('tabBadgeWeekly');
  if (weeklyBadge) weeklyBadge.innerHTML = (!hasWeeklyThisWeek && day <= 1) ? `<span class="tab-badge"></span>` : '';
}

// ── F4: Reminder card ──
function showReminderCard() {
  const { timeline } = chatDataCache;
  const el = document.getElementById('reminderCard');
  if (!el) return;
  // Check if dismissed today
  const today = localDateStr();
  if (localStorage.getItem('welian_reminder_dismissed') === today) { el.style.display = 'none'; return; }
  // Check days since last interaction
  const zh = currentLang === 'zh';
  if (!timeline.length) {
    el.innerHTML = `<div class="reminder-card"><span class="icon">🌱</span><div class="text">${zh?'开始记录你的第一段互动吧':'Start recording your first interaction'}<div class="sub">${zh?'告诉小维你最近见了谁':'Tell Welian who you met recently'}</div></div><button class="close" onclick="dismissReminder()">✕</button></div>`;
    el.style.display = 'block';
    return;
  }
  const lastDate = (timeline[0]?.date || '').substring(0, 10);
  const todayStr = localDateStr();
  const days = lastDate ? Math.floor((new Date(todayStr) - new Date(lastDate)) / 86400000) : 9999;
  if (days >= 3) {
    el.innerHTML = `<div class="reminder-card"><span class="icon">💬</span><div class="text">${zh?`你已经有 ${days} 天没记录互动了`:`You haven't logged an interaction in ${days} days`}<div class="sub">${zh?'要不要记一下最近见了谁？':'Want to log who you met recently?'}</div></div><button class="close" onclick="dismissReminder()">✕</button></div>`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}
function dismissReminder() {
  const today = localDateStr();
  localStorage.setItem('welian_reminder_dismissed', today);
  document.getElementById('reminderCard').style.display = 'none';
}

// ── F4b: Proactive AI suggestions ──
let proactiveSuggestions = [];
let proactiveFetchId = 0;
async function fetchProactiveSuggestions() {
  if (!isAuthed) return;
  // Cancel any in-flight request
  const myId = ++proactiveFetchId;
  // Clear previous suggestions so each entry regenerates
  proactiveSuggestions = [];
  const old = document.getElementById('proactiveCard');
  if (old) old.remove();

  // Ensure weather data is ready (fetchWeather caches, so this is instant if already loaded)
  await fetchWeather().catch(() => {});

  if (myId !== proactiveFetchId) return; // superseded by a newer call

  const zh = currentLang === 'zh';
  const w = weatherCache;
  const now = new Date();
  const h = now.getHours();
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPod/.test(ua);
  const profile = cachedUserProfileObj || {};
  const city = w?.city || '';
  const profileLoc = profile.location || '';
  const traveling = city && profileLoc && !city.includes(profileLoc) && !profileLoc.includes(city);

  const ctx = {
    city,
    weather: w ? `${w.temp}° ${weatherText(w.code, zh)}` : '',
    timeSlot: zh
      ? (h < 6 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 14 ? '午休' : h < 18 ? '下午' : h < 22 ? '晚间' : '深夜')
      : (h < 6 ? 'late night' : h < 9 ? 'early morning' : h < 12 ? 'morning' : h < 14 ? 'lunch' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'late night'),
    device: isMobile ? (zh ? '手机' : 'mobile') : (zh ? '桌面端' : 'desktop'),
    holidays: getUpcomingHolidays(now, zh),
    traveling,
  };

  console.log('[proactive] fetching suggestions, context:', ctx);
  try {
    const token = await getClerkToken();
    if (!token) { console.log('[proactive] no token'); return; }
    if (myId !== proactiveFetchId) return; // superseded
    const resp = await fetch(`${CLOUD_URL}/ai/proactive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, context: ctx }),
    });
    const data = await resp.json();
    console.log('[proactive] response:', resp.status, data);
    if (resp.ok && data.suggestions?.length > 0) {
      proactiveSuggestions = data.suggestions;
      renderProactiveSuggestions();
    }
  } catch (e) {
    console.log('[proactive] failed:', e.message);
  }
}

function renderProactiveSuggestions() {
  if (!proactiveSuggestions.length) return;
  const zh = currentLang === 'zh';

  // Remove old card
  const existing = document.getElementById('proactiveCard');
  if (existing) existing.remove();

  // Lightweight hint bar above input dock — no card, no border, just text
  const card = document.createElement('div');
  card.id = 'proactiveCard';
  card.style.cssText = 'max-width:var(--chat-max);margin:0 auto;padding:4px 16px 6px;';
  card.innerHTML = proactiveSuggestions.map(s => `
    <div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
      <span style="font-size:.85em;opacity:.5">💡</span>
      <span style="flex:1;font-size:.78em;color:var(--dim);line-height:1.5">${escapeHtml(s.text)}</span>
      ${s.action ? `<button onclick="proactiveClick('${escapeHtml(s.action).replace(/'/g,"\\'")}')" style="font-size:.72em;padding:2px 8px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;white-space:nowrap;font-family:inherit;color:var(--dim)">${zh?'去做':'Go'}</button>` : ''}
    </div>
  `).join('');

  // Insert right above the input dock
  const inputDock = document.querySelector('.input-dock');
  if (inputDock && inputDock.parentNode) {
    inputDock.parentNode.insertBefore(card, inputDock);
  }

  // Fade out when user starts typing
  const inputEl = document.getElementById('input');
  if (inputEl) {
    const fadeHandler = () => {
      if (inputEl.value.length > 0) {
        card.style.transition = 'opacity .3s ease';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 300);
        inputEl.removeEventListener('input', fadeHandler);
      }
    };
    inputEl.addEventListener('input', fadeHandler);
  }
}

function proactiveClick(action) {
  const input = document.getElementById('input');
  if (input) {
    input.value = action;
    send();
  }
}

function dismissProactive() {
  const card = document.getElementById('proactiveCard');
  if (card) card.remove();
}

// ── F5: Health ring (added to Overview) ──
function healthRingSvg(covered, total) {
  const pct = total > 0 ? Math.round(covered / total * 100) : 0;
  const r = 28, c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 50 ? 'var(--green)' : pct >= 30 ? 'var(--accent)' : '#e8a040';
  return `<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 35 35)" stroke-linecap="round"/><text x="35" y="40" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text)">${pct}%</text></svg>`;
}

// ── F6: Desktop sidebar ──
function renderDesktopSidebar() {
  if (window.innerWidth < 900) return;
  const { contacts, todos, timeline } = chatDataCache;
  const zh = currentLang === 'zh';
  const el = document.getElementById('desktopSidebar');
  if (!el) return;
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  const now = new Date();
  const todayStr = localDateStr(now);

  // ── Section 1: 待办 (todos) ──
  const overdueTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) < todayStr)
    .sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 5);
  const todayTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) === todayStr);
  const pendingAll = todos.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 5);
  let todoHtml = '';
  const todoCount = overdueTodos.length + todayTodos.length;
  if (todoCount > 0) {
    todayTodos.forEach(t => {
      const name = contactMap[t.contact]?.name || '';
      const tId = escapeHtml(t.id || '');
      todoHtml += `<div class="rs-item" onclick="showTodoDetail('${tId}')"><span class="icon">📌</span><span class="text">${escapeHtml((t.task||'').substring(0,25))}</span><span class="badge">${zh?'今天':'Today'}</span></div>`;
    });
    overdueTodos.forEach(t => {
      const name = contactMap[t.contact]?.name || '';
      const tId = escapeHtml(t.id || '');
      todoHtml += `<div class="rs-item" onclick="showTodoDetail('${tId}')"><span class="icon">⚠️</span><span class="text">${escapeHtml((t.task||'').substring(0,25))}</span><span class="badge urgent">${zh?'超期':'Overdue'}</span></div>`;
    });
  } else if (pendingAll.length) {
    pendingAll.forEach(t => {
      const tId = escapeHtml(t.id || '');
      todoHtml += `<div class="rs-item" onclick="showTodoDetail('${tId}')"><span class="icon">✅</span><span class="text">${escapeHtml((t.task||'').substring(0,25))}</span></div>`;
    });
  } else {
    todoHtml = `<div class="rs-empty">${zh?'暂无待办':'No todos'}</div>`;
  }

  // ── Section 2: 关系看板 (dashboard) ──
  const lastContact = {};
  timeline.forEach(t => { if (t.contact) lastContact[t.contact] = t.date; });
  const staleContacts = contacts
    .filter(c => c.nature === 'leverage' || c.nature === 'dual')
    .filter(c => {
      const snooze = c.snooze_until;
      if (snooze && snooze.substring(0, 10) > todayStr) return false;
      return true;
    })
    .map(c => {
      const last = lastContact[c.id];
      if (!last) return { c, days: 999 };
      const days = Math.floor((new Date(todayStr) - new Date((last || '').substring(0, 10))) / 86400000);
      return { c, days };
    })
    .filter(x => x.days >= 14)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const upcomingDates = [];
  contacts.forEach(c => {
    (c.important_dates || []).forEach(dt => {
      const dateStr = dt.date || '';
      if (dateStr.length >= 5) {
        const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
        const thisYear = `${now.getFullYear()}-${mmdd}`;
        const dDate = new Date(thisYear);
        const delta = Math.floor((dDate - now) / 86400000);
        if (delta >= 0 && delta <= 30) {
          upcomingDates.push({ name: c.name, date: mmdd, label: dt.label || '', delta, contactId: c.id });
        }
      }
    });
  });
  upcomingDates.sort((a, b) => a.delta - b.delta);
  let dashHtml = '';
  const dashCount = staleContacts.length + upcomingDates.length;
  if (staleContacts.length) {
    staleContacts.forEach(x => {
      const days = x.days === 999 ? (zh?'从未':'never') : `${x.days}${zh?'天':'d'}`;
      const cid = escapeHtml(x.c.id);
      const cname = escapeHtml(x.c.name).replace(/'/g,"\\'");
      dashHtml += `<div class="rs-item" onclick="quickDraftTo('${cname}')"><span class="icon">🔄</span><span class="text">${escapeHtml(x.c.name)}</span><span class="badge">${days}</span><button onclick="event.stopPropagation();snoozeContact('${cid}','${cname}')" style="font-size:.65em;padding:1px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--dimmer);cursor:pointer;margin-left:4px;white-space:nowrap;flex-shrink:0">${zh?'暂不':'snooze'}</button></div>`;
    });
  }
  if (upcomingDates.length) {
    upcomingDates.slice(0, 3).forEach(dt => {
      const deltaLabel = dt.delta === 0 ? (zh?'今天':'today') : `${dt.delta}${zh?'天后':'d'}`;
      dashHtml += `<div class="rs-item"><span class="icon">🎂</span><span class="text">${escapeHtml(dt.name)} — ${escapeHtml(dt.label||dt.date)}</span><span class="badge">${deltaLabel}</span></div>`;
    });
  }
  if (!dashHtml) dashHtml = `<div class="rs-empty">${zh?'一切就绪':'All good'}</div>`;

  // ── Section 3: 最近互动 (recent interactions) ──
  let recentHtml = '';
  if (timeline.length) {
    const sorted = [...timeline].sort((a, b) => {
      const da = new Date((a.date || '1970-01-01').substring(0, 10));
      const db = new Date((b.date || '1970-01-01').substring(0, 10));
      return db - da;
    });
    sorted.slice(0, 5).forEach(t => {
      const name = contactMap[t.contact]?.name || '';
      const tId = escapeHtml(t.id || '');
      recentHtml += `<div class="rs-item" onclick="showInteractionDetail('${tId}','${escapeHtml(t.contact||'')}')"><span class="icon">·</span><span class="text">${escapeHtml(name)}：${escapeHtml((t.summary||'').substring(0,20))}</span></div>`;
    });
  } else {
    recentHtml = `<div class="rs-empty">${zh?'暂无互动':'No interactions'}</div>`;
  }

  // Restore collapse state from localStorage
  const collapsed = JSON.parse(localStorage.getItem('welian_rs_collapsed') || '{}');

  el.innerHTML = `
    <div class="rs-section ${collapsed.todos ? 'collapsed' : ''}" id="rsTodos">
      <div class="rs-header" onclick="toggleRsSection('rsTodos')">
        <span>✅ ${zh?'待办':'Todos'}</span>
        ${todoCount > 0 ? `<span class="badge">${todoCount}</span>` : ''}
        <span class="arrow">▾</span>
      </div>
      <div class="rs-body">${todoHtml}</div>
    </div>
    <div class="rs-section ${collapsed.dashboard ? 'collapsed' : ''}" id="rsDashboard">
      <div class="rs-header" onclick="toggleRsSection('rsDashboard')">
        <span>📋 ${zh?'关系看板':'Dashboard'}</span>
        ${dashCount > 0 ? `<span class="badge">${dashCount}</span>` : ''}
        <span class="arrow">▾</span>
      </div>
      <div class="rs-body">${dashHtml}</div>
    </div>
    <div class="rs-section ${collapsed.recent ? 'collapsed' : ''}" id="rsRecent">
      <div class="rs-header" onclick="toggleRsSection('rsRecent')">
        <span>💬 ${zh?'最近互动':'Recent'}</span>
        <span class="arrow">▾</span>
      </div>
      <div class="rs-body">${recentHtml}</div>
    </div>
  `;
  el.classList.remove('hidden');
}

function toggleRsSection(sectionId) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  sec.classList.toggle('collapsed');
  const collapsed = JSON.parse(localStorage.getItem('welian_rs_collapsed') || '{}');
  collapsed[sectionId] = sec.classList.contains('collapsed');
  localStorage.setItem('welian_rs_collapsed', JSON.stringify(collapsed));
}

function showTodoDetail(todoId) {
  const { contacts, todos } = chatDataCache;
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  // Search in all possible caches
  let entry = todos.find(t => t.id === todoId);
  if (!entry && typeof todosCache !== 'undefined') entry = todosCache.find(t => t.id === todoId);
  if (!entry && typeof todosDoneCache !== 'undefined') entry = todosDoneCache.find(t => t.id === todoId);
  if (!entry && mineCache.todos) entry = mineCache.todos.find(t => t.id === todoId);
  if (!entry) return;
  const zh = currentLang === 'zh';
  const contactName = contactMap[entry.contact]?.name || '';
  const task = entry.task || entry.content || '';
  const due = (entry.due || '').substring(0, 10);
  const status = entry.status || (entry.done ? 'done' : 'pending');
  const notes = entry.notes || entry.detail || '';
  const priority = entry.priority || '';
  const created = (entry.created_at || entry.date || '').substring(0, 10);

  // Compute days until due
  let dueLabel = due;
  if (due) {
    const todayStr = localDateStr();
    const delta = Math.floor((new Date(due) - new Date(todayStr)) / 86400000);
    if (delta < 0) dueLabel = `${due}（${zh?'超期'+(-delta)+'天':'overdue '+(-delta)+'d'}）`;
    else if (delta === 0) dueLabel = `${due}（${zh?'今天':'today'}）`;
    else dueLabel = `${due}（${zh?delta+'天后':'in '+delta+'d'}）`;
  }

  let html = `<div style="display:flex;flex-direction:column;gap:12px">`;
  // Header
  html += `<div style="text-align:center;padding-bottom:8px;border-bottom:1px solid var(--border)">`;
  html += `<div style="font-size:1.1em;font-weight:500">${escapeHtml(task)}</div>`;
  if (contactName) html += `<div style="font-size:.8em;color:var(--dim);margin-top:4px">👤 ${escapeHtml(contactName)}</div>`;
  html += `</div>`;
  // Due date
  if (dueLabel) {
    html += `<div><div class="label-sm">${zh?'截止日期':'Due date'}</div><div>${escapeHtml(dueLabel)}</div></div>`;
  }
  // Status
  if (status) {
    const statusLabel = status === 'done' || status === 'completed' ? (zh?'已完成':'Completed') : (zh?'待完成':'Pending');
    html += `<div><div class="label-sm">${zh?'状态':'Status'}</div><div>${escapeHtml(statusLabel)}</div></div>`;
  }
  // Priority
  if (priority) {
    html += `<div><div class="label-sm">${zh?'优先级':'Priority'}</div><div>${escapeHtml(priority)}</div></div>`;
  }
  // Notes
  if (notes) {
    html += `<div><div class="label-sm">${zh?'备注':'Notes'}</div><div style="white-space:pre-wrap">${escapeHtml(notes)}</div></div>`;
  }
  // Created date
  if (created) {
    html += `<div><div class="label-sm">${zh?'创建日期':'Created'}</div><div>${escapeHtml(created)}</div></div>`;
  }
  // Buttons
  html += `<div style="display:flex;gap:8px;margin-top:8px">`;
  if (contactName) {
    html += `<button onclick="openContactDetail('${escapeHtml(entry.contact||'')}')" class="btn-flex-item">${zh?'查看联系人':'View contact'}</button>`;
  }
  html += `<button onclick="closeContactDetail()" class="btn-flex-item">${zh?'关闭':'Close'}</button>`;
  html += `</div>`;
  html += `</div>`;

  document.getElementById('detailName').textContent = zh ? '待办详情' : 'Todo Detail';
  document.getElementById('detailSub').textContent = contactName || '';
  document.getElementById('detailBody').innerHTML = html;
  const existing = document.querySelector('#contactDetail .mine-detail-header .detail-btns');
  if (existing) existing.remove();
  document.getElementById('contactDetailOverlay').classList.add('show');
  document.getElementById('contactDetail').classList.add('show');
}

function showInteractionDetail(tlId, contactId) {
  // Find the timeline entry from cache or contact detail timeline
  const { contacts, timeline } = chatDataCache;
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  // Search in full timeline cache
  let entry = timeline.find(t => t.id === tlId);
  // Also check window._currentDetailTimeline (from open contact detail)
  if (!entry && window._currentDetailTimeline) {
    entry = window._currentDetailTimeline.find(t => t.id === tlId);
  }
  // Fallback: if no id match, try matching by contact + first entry (for old data without id)
  if (!entry && contactId) {
    entry = timeline.find(t => t.contact === contactId);
    if (!entry && window._currentDetailTimeline) {
      entry = window._currentDetailTimeline.find(t => t.contact === contactId);
    }
  }
  if (!entry) return;
  const zh = currentLang === 'zh';
  const contactName = contactMap[contactId]?.name || contactMap[entry.contact]?.name || '';
  const d = I18N[currentLang];
  const date = (entry.date || '').substring(0, 10);
  const summary = entry.summary || entry.action || '';
  const details = entry.details || entry.notes || entry.detail || '';
  const action = entry.action || '';
  const keywords = (entry.keywords || []).join(', ');
  const keyPoints = (entry.key_points || []).join('\n');

  let html = `<div style="display:flex;flex-direction:column;gap:12px">`;
  // Header
  html += `<div style="text-align:center;padding-bottom:8px;border-bottom:1px solid var(--border)">`;
  html += `<div style="font-size:1.1em;font-weight:500">${escapeHtml(contactName)}</div>`;
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:4px">📅 ${escapeHtml(date)}</div>`;
  html += `</div>`;
  // Summary
  if (summary) {
    html += `<div><div class="label-sm">${zh?'摘要':'Summary'}</div><div>${escapeHtml(summary)}</div></div>`;
  }
  // Details
  if (details) {
    html += `<div><div class="label-sm">${zh?'详情':'Details'}</div><div style="white-space:pre-wrap">${escapeHtml(details)}</div></div>`;
  }
  // Key points
  if (keyPoints) {
    html += `<div><div class="label-sm">${zh?'要点':'Key points'}</div><div style="white-space:pre-wrap">${escapeHtml(keyPoints)}</div></div>`;
  }
  // Keywords
  if (keywords) {
    html += `<div><div class="label-sm">${zh?'关键词':'Keywords'}</div><div>${escapeHtml(keywords)}</div></div>`;
  }
  // Action type
  if (action) {
    html += `<div><div class="label-sm">${zh?'类型':'Type'}</div><div>${escapeHtml(action)}</div></div>`;
  }
  // Buttons
  html += `<div style="display:flex;gap:8px;margin-top:8px">`;
  html += `<button onclick="openContactDetail('${escapeHtml(contactId||entry.contact||'')}')" class="btn-flex-item">${zh?'查看联系人':'View contact'}</button>`;
  html += `<button onclick="closeContactDetail()" class="btn-flex-item">${zh?'关闭':'Close'}</button>`;
  html += `</div>`;
  html += `</div>`;

  document.getElementById('detailName').textContent = contactName || (zh ? '互动详情' : 'Interaction Detail');
  document.getElementById('detailSub').textContent = date;
  document.getElementById('detailBody').innerHTML = html;
  // Remove header buttons from contact detail
  const existing = document.querySelector('#contactDetail .mine-detail-header .detail-btns');
  if (existing) existing.remove();
  document.getElementById('contactDetailOverlay').classList.add('show');
  document.getElementById('contactDetail').classList.add('show');
}

// ── F7: Empty state ──
function toggleEmptyState() {
  const { contacts } = chatDataCache;
  const illus = document.getElementById('emptyStateIllus');
  if (!illus) return;
  // Show empty state only for logged-in users with no contacts and no chat messages
  const hasMessages = document.getElementById('chatBody').children.length > 0;
  if (isAuthed && !contacts.length && !hasMessages) {
    illus.style.display = 'block';
  } else {
    illus.style.display = 'none';
  }
}

// ── Warmth elements ──
let weatherCache = null;

async function fetchWeather() {
  if (weatherCache) return weatherCache;
  // Try cached location
  const cachedLoc = localStorage.getItem('welian_location');
  if (cachedLoc) {
    try {
      const loc = JSON.parse(cachedLoc);
      weatherCache = await fetchWeatherFromAPI(loc.lat, loc.lon);
      return weatherCache;
    } catch(e) {}
  }
  // Try geolocation
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(2);
        const lon = pos.coords.longitude.toFixed(2);
        localStorage.setItem('welian_location', JSON.stringify({ lat, lon }));
        try {
          weatherCache = await fetchWeatherFromAPI(lat, lon);
          resolve(weatherCache);
        } catch(e) { resolve(null); }
      },
      () => resolve(null),
      { timeout: 5000, maximumAge: 600000 }
    );
  });
}

async function fetchWeatherFromAPI(lat, lon) {
  // Open-Meteo: free, no API key needed
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('weather fetch failed');
  const data = await resp.json();
  const temp = Math.round(data.current?.temperature_2m ?? 0);
  const code = data.current?.weather_code ?? 0;
  const wind = Math.round(data.current?.wind_speed_10m ?? 0);
  // Reverse geocode for city name (free, no key)
  let city = '';
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=${currentLang === 'zh' ? 'zh' : 'en'}`;
    const geoResp = await fetch(geoUrl, { headers: { 'User-Agent': 'Welian/1.0' } });
    if (geoResp.ok) {
      const geoData = await geoResp.json();
      city = geoData.address?.city || geoData.address?.town || geoData.address?.county || geoData.address?.state || '';
    }
  } catch(e) {}
  return { temp, code, wind, city };
}

function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

function weatherText(code, zh) {
  if (code === 0) return zh ? '晴' : 'Clear';
  if (code <= 3) return zh ? '多云' : 'Cloudy';
  if (code <= 48) return zh ? '雾' : 'Fog';
  if (code <= 67) return zh ? '雨' : 'Rain';
  if (code <= 77) return zh ? '雪' : 'Snow';
  if (code <= 82) return zh ? '阵雨' : 'Showers';
  if (code <= 86) return zh ? '阵雪' : 'Snow showers';
  if (code >= 95) return zh ? '雷雨' : 'Thunderstorm';
  return zh ? '多云' : 'Cloudy';
}

function weatherGreeting(weather, zh) {
  if (!weather) return null;
  const h = new Date().getHours();
  const emoji = weatherEmoji(weather.code);
  const wText = weatherText(weather.code, zh);
  const temp = weather.temp;
  const city = weather.city || '';
  const cityPrefix = city ? `${city} · ` : '';

  // Temperature-based warmth suggestions
  let tempTip = '';
  if (zh) {
    if (temp <= 5) tempTip = '天冷，给远方的朋友发句问候吧';
    else if (temp <= 15) tempTip = '微凉，适合约人喝杯热的';
    else if (temp <= 25) tempTip = '天气宜人，适合约人走走';
    else if (temp <= 32) tempTip = '天热，一句关心胜过冰饮';
    else tempTip = '酷暑，记得关心身边的人';
  } else {
    if (temp <= 5) tempTip = 'Cold day — send a warm message to someone far away';
    else if (temp <= 15) tempTip = 'Chilly — perfect for inviting someone for a hot drink';
    else if (temp <= 25) tempTip = 'Lovely weather — great for a walk with someone';
    else if (temp <= 32) tempTip = 'Hot day — a caring word beats a cold drink';
    else tempTip = 'Scorching — remember to check on those around you';
  }

  // Weather-based suggestions
  let weatherTip = '';
  if (zh) {
    if (weather.code >= 51 && weather.code <= 67) weatherTip = '雨天适合给老朋友写条长消息';
    else if (weather.code >= 95) weatherTip = '雷雨天，宅家正好整理关系';
    else if (weather.code === 0 && h >= 9 && h <= 17) weatherTip = '晴天好心情，适合主动联系';
    else if (weather.code <= 48) weatherTip = '雾天慢一点，想想那些重要的人';
  } else {
    if (weather.code >= 51 && weather.code <= 67) weatherTip = 'Rainy day — perfect for a long message to an old friend';
    else if (weather.code >= 95) weatherTip = 'Stormy — great time to organize your relationships';
    else if (weather.code === 0 && h >= 9 && h <= 17) weatherTip = 'Sunny mood — a good day to reach out';
    else if (weather.code <= 48) weatherTip = 'Foggy — slow down, think about who matters';
  }

  const tip = weatherTip || tempTip;
  return { emoji, wText, temp, cityPrefix, tip };
}

async function showDailyGreeting() {
  const zh = currentLang === 'zh';
  const h = new Date().getHours();
  let greeting = '';
  if (zh) {
    if (h < 6) greeting = '夜深了，还在惦记关系的人，一定很温暖 🌙';
    else if (h < 9) greeting = '早安，今天也要用心对待每段关系 ☀️';
    else if (h < 12) greeting = '上午好，记得给重要的人留点时间 🌿';
    else if (h < 14) greeting = '午安，趁休息想想最近见了谁 🍃';
    else if (h < 18) greeting = '下午好，有没有该联系的人了？ 🌤️';
    else if (h < 22) greeting = '晚上好，今天有什么值得记录的互动？ 🌙';
    else greeting = '夜安，静下来想想那些重要的人 🌙';
  } else {
    if (h < 6) greeting = 'Late night, still caring about relationships — that\'s warm 🌙';
    else if (h < 9) greeting = 'Good morning, care for every relationship today ☀️';
    else if (h < 12) greeting = 'Good morning, save time for those who matter 🌿';
    else if (h < 14) greeting = 'Good afternoon, who have you seen recently? 🍃';
    else if (h < 18) greeting = 'Good afternoon, anyone you should reach out to? 🌤️';
    else if (h < 22) greeting = 'Good evening, any interactions worth recording? 🌙';
    else greeting = 'Good night, reflect on those who matter 🌙';
  }
  // Try to add weather-based greeting
  const weather = await fetchWeather();
  const wg = weatherGreeting(weather, zh);
  if (wg) {
    greeting = `${wg.emoji} ${wg.cityPrefix}${wg.wText} ${wg.temp}°\n${wg.tip}`;
  }
  const el = document.getElementById('dailyGreeting');
  if (el) { el.textContent = greeting; el.style.display = 'block'; el.style.whiteSpace = 'pre-line'; }
}

const WARMTH_QUOTES_ZH = [
  '「关系的温度，不在于频率，而在于用心。」',
  '「你不需要记住所有事，只需要记住那些重要的人。」',
  '「最好的社交，是让每个人都被看见。」',
  '「联系不是任务，是心意的流动。」',
  '「一段好的关系，是两个人都愿意为对方多想一步。」',
  '「不是关系淡了，是你忘了浇水。」',
  '「记住一个人的生日，比记住一百条道理更有用。」',
  '「关系像植物，不需要每天浇水，但不能忘了。」',
];
const WARMTH_QUOTES_EN = [
  '"The warmth of a relationship is not in frequency, but in sincerity."',
  '"You don\'t need to remember everything, just the people who matter."',
  '"The best social skill is making everyone feel seen."',
  '"Reaching out isn\'t a task — it\'s the flow of care."',
  '"A good relationship is when both people think one step ahead for each other."',
  '"Relationships don\'t fade — you just forgot to water them."',
  '"Remembering a birthday is worth more than a hundred principles."',
  '"Relationships are like plants — not daily watering, but never forgetting."',
];

function showWarmthQuote() {
  const zh = currentLang === 'zh';
  const quotes = zh ? WARMTH_QUOTES_ZH : WARMTH_QUOTES_EN;
  // Rotate by day of year
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const quote = quotes[dayOfYear % quotes.length];
  const el = document.getElementById('warmthQuote');
  if (el) { el.textContent = quote; el.style.display = 'block'; }
}

function showStreakBadge() {
  const { timeline } = chatDataCache;
  if (!timeline.length) return;
  // Count consecutive days with interactions
  const days = new Set();
  timeline.forEach(t => { if (t.date) days.add(t.date.substring(0, 10)); });
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = localDateStr(d);
    if (days.has(ds)) streak++;
    else if (i > 0) break; // allow today to be empty
  }
  if (streak < 2) return;
  const zh = currentLang === 'zh';
  const el = document.getElementById('streakBadge');
  if (el) {
    el.innerHTML = `<span class="flame">🔥</span> ${zh ? `连续 ${streak} 天记录互动` : `${streak}-day streak`}`;
    el.style.display = 'inline-flex';
  }
}

// ── F8: Voice input ──
let voiceRecognition = null;
let isRecording = false;
function toggleVoiceInput() {
  const btn = document.getElementById('voiceBtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert(currentLang === 'zh' ? '浏览器不支持语音输入' : 'Voice input not supported'); return; }
  if (isRecording) {
    voiceRecognition?.stop();
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    return;
  }
  voiceRecognition = new SR();
  voiceRecognition.lang = currentLang === 'zh' ? 'zh-CN' : 'en-US';
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;
  voiceRecognition.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    input.value = text;
  };
  voiceRecognition.onend = () => {
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤';
  };
  voiceRecognition.onerror = () => {
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤';
  };
  voiceRecognition.start();
  isRecording = true;
  btn.classList.add('recording');
  btn.textContent = '⏹';
}

// ── F9: AI message quick actions ──
function addMsgActions(msgEl, text) {
  const zh = currentLang === 'zh';
  const actions = [];
  // Detect contact names in reply
  const { contacts } = chatDataCache;
  const mentionedContacts = contacts.filter(c => text.includes(c.name));
  if (mentionedContacts.length) {
    const c = mentionedContacts[0];
    actions.push(`<button class="msg-action-btn" onclick="openContactDetail('${escapeHtml(c.id)}')">${zh?'查看详情':'Detail'}</button>`);
  }
  // Detect todo-like content
  if (/待办|todo|提醒|remind|跟进|follow.?up/i.test(text)) {
    actions.push(`<button class="msg-action-btn" onclick="openMine();setTimeout(()=>switchMineTab('todos'),100)">${zh?'加入待办':'Todos'}</button>`);
  }
  // Detect PDF file paths in reply (e.g. /tmp/report.pdf, ~/output.pdf)
  const pdfPaths = extractPdfPaths(text);
  for (const p of pdfPaths) {
    actions.push(`<button class="msg-action-btn pdf-dl-btn" onclick="downloadPdfViaAgent('${escapeHtml(p)}', this)">${zh?'⬇ 下载PDF':'⬇ PDF'}</button>`);
  }
  // Always: copy
  actions.push(`<button class="msg-action-btn" onclick="copyMsgText(this)">${zh?'复制':'Copy'}</button>`);
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'msg-actions';
  actionsDiv.innerHTML = actions.join('');
  msgEl.appendChild(actionsDiv);
}

// Extract PDF file paths from text
function extractPdfPaths(text) {
  // Strip ANSI escape codes (Devin CLI output may contain them)
  const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const paths = new Set();
  // Match absolute paths ending in .pdf (allow spaces in path segments)
  const re1 = /(?:\/[^\s'"`<>|]+)+\.pdf/gi;
  let m;
  while ((m = re1.exec(clean)) !== null) {
    paths.add(m[0]);
  }
  // Match ~/path/file.pdf
  const re2 = /~\/[^\s'"`<>|]+\.pdf/gi;
  while ((m = re2.exec(clean)) !== null) {
    paths.add(m[0]);
  }
  // Match backtick-wrapped paths: `/tmp/report.pdf`
  const re3 = /`([^`]+\.pdf)`/gi;
  while ((m = re3.exec(clean)) !== null) {
    paths.add(m[1]);
  }
  // Match markdown link: [text](/path/to.pdf)
  const re4 = /\]\(([^)]+\.pdf)\)/gi;
  while ((m = re4.exec(clean)) !== null) {
    paths.add(m[1]);
  }
  const result = [...paths].slice(0, 3);
  if (result.length) console.log('[PDF] Detected paths:', result);
  return result;
}

// Download a local PDF file via agent bridge (reads file, returns base64)
async function downloadPdfViaAgent(filePath, btn) {
  const zh = currentLang === 'zh';
  if (btn) btn.disabled = true;
  if (btn) btn.textContent = zh ? '⏳ 读取中…' : '⏳ Loading…';
  if (!bridgeFrame || !bridgeReady) {
    if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
    alert(zh ? '本地 agent 未连接，无法下载文件' : 'Local agent not connected');
    return;
  }
  try {
    const result = await agentReadFile(filePath);
    if (result && result.content) {
      // Decode base64 and download
      const binary = atob(result.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (btn) btn.textContent = zh ? '✓ 已下载' : '✓ Done';
    } else if (result && result.error) {
      if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
      alert(zh ? `下载失败：${result.message}` : `Download failed: ${result.message}`);
    } else {
      if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
      alert(zh ? '下载失败：agent 无响应' : 'Download failed: no response');
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
    alert(zh ? `下载出错：${e.message}` : `Error: ${e.message}`);
  }
}

// Read a local file via agent bridge
function agentReadFile(filePath) {
  if (!bridgeFrame || !bridgeReady) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reqId = 'readfile_' + Date.now();
    let resolved = false;
    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.content) {
          resolve(msg.data);
        } else if (msg.data.type === 'error') {
          resolve({ error: true, message: msg.data.message });
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);
    setTimeout(() => {
      if (!resolved) { resolved = true; window.removeEventListener('message', handler); resolve(null); }
    }, 15000);
    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent', type: 'send',
      payload: { cmd: 'read_file', id: reqId, path: filePath }
    }, '*');
  });
}
function copyMsgText(btn) {
  const bubble = btn.closest('.msg')?.querySelector('.bubble.ai');
  if (bubble) {
    const text = bubble.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = currentLang === 'zh' ? '✓ 已复制' : '✓ Copied';
      setTimeout(() => { btn.textContent = currentLang === 'zh' ? '复制' : 'Copy'; }, 1500);
    });
  }
}

// ── Mine panel ──

let mineCurrentTab = 'overview';
let mineCache = {};  // tab → data cache

async function openMine() {
  if (!isAuthed) {
    addMsg('ai', I18N[currentLang].billing_not_authed);
    return;
  }
  sessionStorage.setItem('welian_mine_open', '1');
  document.getElementById('mine-panel').classList.add('show');
  document.getElementById('mineTitle').textContent = I18N[currentLang].mine_title;
  const savedTab = localStorage.getItem('welian_mine_tab') || 'overview';
  switchMineTab(savedTab);
}

function closeMine() {
  sessionStorage.removeItem('welian_mine_open');
  document.getElementById('mine-panel').classList.remove('show');
}

// ── Support panel ──

function openSupport() {
  const zh = currentLang === 'zh';
  const panel = document.getElementById('support-panel');
  const content = document.getElementById('supportContent');
  document.getElementById('supportTitle').textContent = zh ? '联系支持' : 'Contact Support';
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="mine-card" style="padding:16px">
        <div class="mine-card-title" style="color:var(--accent);margin-bottom:8px">${zh ? '📧 邮件支持' : '📧 Email Support'}</div>
        <div class="mine-contact-sub" style="margin-bottom:10px">${zh ? '遇到问题？发邮件给我们，通常 24 小时内回复。' : 'Having issues? Email us, typically replied within 24 hours.'}</div>
        <a href="mailto:contact@welian.app" style="display:inline-block;padding:8px 16px;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-size:.85em">contact@welian.app</a>
      </div>
      <div class="mine-card" style="padding:16px">
        <div class="mine-card-title" style="color:var(--accent);margin-bottom:8px">${zh ? '📖 常见问题' : '📖 FAQ'}</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:.85em">
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '数据存储在哪里？' : 'Where is my data stored?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '数据存储在 Cloudflare 全球边缘网络，加密传输。' : 'Data is stored on Cloudflare\'s global edge network with encrypted transit.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '如何导出我的数据？' : 'How do I export my data?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '在「我的」→「概览」中点击「导出数据」，可导出全部联系人和互动记录。' : 'Go to "Me" → "Overview" and click "Export Data" to download all contacts and interactions.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? 'Live 模式和 Cloud 模式有什么区别？' : 'What\'s the difference between Live and Cloud mode?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? 'Live 模式支持 Agent 能力，目前支持 Devin，其它还在逐步接入当中。Cloud 模式数据在云端，无需安装。' : 'Live mode supports Agent capabilities, currently Devin with more being integrated. Cloud mode stores data in the cloud, no installation needed.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '如何注销账户？' : 'How do I delete my account?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '在「我的」→「设置」中点击「注销账户」，所有数据将被永久删除。' : 'Go to "Me" → "Settings" and click "Delete account". All data will be permanently deleted.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '待办事项如何同步到手机日历？' : 'How to sync todos to my phone calendar?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '在「我的」→「设置」→「日历同步」中复制订阅链接，粘贴到手机日历应用（iPhone 日历、华为日历、Outlook 等）的「添加订阅日历」中。待办和重要日期会自动同步，定期更新。' : 'Go to "Me" → "Settings" → "Calendar Sync", copy the subscription URL, and paste it into your phone calendar app (Apple Calendar, Huawei Calendar, Outlook, etc.) under "Add Subscription Calendar". Todos and important dates will sync automatically.'}</div></details>
        </div>
      </div>
      <div class="mine-card" style="padding:16px">
        <div class="mine-card-title" style="color:var(--accent);margin-bottom:8px">${zh ? '🔗 相关链接' : '🔗 Links'}</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:.85em">
          <a href="https://welian.app" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">welian.app →</a>
        </div>
      </div>
    </div>
  `;
  panel.style.display = 'flex';
  panel.classList.add('show');
}

function closeSupport() {
  const panel = document.getElementById('support-panel');
  panel.classList.remove('show');
  panel.style.display = 'none';
}

function switchMineTab(tab) {
  mineCurrentTab = tab;
  sessionStorage.setItem('welian_mine_tab', tab);
  localStorage.setItem('welian_mine_tab', tab);
  // Update tab buttons
  document.querySelectorAll('.mine-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Update title
  const d = I18N[currentLang];
  const titles = { overview: d.mine_overview_title, contacts: d.tab_contacts, todos: d.todo_title, timeline: d.tab_timeline, weekly: d.mine_weekly_title, monthly: d.monthly_title, signals: currentLang==='zh'?'📡 HN 信号':'📡 Signals', billing: d.billing_title, settings: d.tab_settings };
  document.getElementById('mineTitle').textContent = titles[tab] || d.mine_title;
  // Load content
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  if (tab === 'overview') loadOverview();
  else if (tab === 'contacts') loadContactsTab();
  else if (tab === 'todos') loadTodosTab();
  else if (tab === 'timeline') loadTimelineTab();
  else if (tab === 'weekly') loadWeeklyTab();
  else if (tab === 'monthly') loadMonthlyTab();
  else if (tab === 'signals') loadSignalsTab();
  else if (tab === 'billing') loadBillingTab();
  else if (tab === 'settings') loadSettingsTab();
}

// ── API helpers ──

async function mineApi(path, method = 'GET', body = null) {
  const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
  if (!token) throw new Error('No token');
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) {
    // Inject session_token for AI endpoints that need it
    body.session_token = token;
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${CLOUD_URL}${path}`, opts);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Overview tab ──

async function loadOverview() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  try {
    const [contactsRes, todosRes, timelineRes] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    const contacts = contactsRes.contacts || [];
    const todos = todosRes.todos || [];
    const allTimeline = timelineRes.timeline || [];

    // Cache contacts for detail view
    mineCache.contacts = contacts;

    // Stats
    const leverage = contacts.filter(c => c.nature === 'leverage').length;
    const nurture = contacts.filter(c => c.nature === 'nurture').length;
    const dual = contacts.filter(c => c.nature === 'dual').length;

    // This month interactions
    const now = new Date();
    const zh = currentLang === 'zh';
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTimeline = allTimeline.filter(t => (t.date || '').startsWith(monthPrefix));
    const monthContacts = new Set(monthTimeline.map(t => t.contact).filter(Boolean));

    // ── Role classification ──
    // Friend: nurture/dual with non-family relations, or any contact with friend keywords
    // Family: nurture with family relations (父母/配偶/子女/家人/亲戚/兄弟/姐妹)
    // Collaborator: leverage/dual with work relations
    const familyKeywords = ['父', '母', '爸', '妈', '配偶', '妻', '夫', '子', '女', '家', '亲戚', '兄弟', '姐妹', '爷爷', '奶奶', '外公', '外婆'];
    const friendKeywords = ['朋友', '友', '同学', '室友', '邻居', 'friend', 'buddy', 'pal'];
    const isFamily = (c) => {
      const rel = (c.relation || '') + (c.role || '') + (c.sub_relation || '');
      if (familyKeywords.some(k => rel.includes(k))) return true;
      if (c.nature === 'nurture' || c.nature === 'dual') {
        return familyKeywords.some(k => rel.includes(k));
      }
      return false;
    };
    const isFriend = (c) => {
      if (isFamily(c)) return false;
      const rel = (c.relation || '') + (c.role || '') + (c.sub_relation || '');
      // nurture/dual non-family → friend
      if (c.nature === 'nurture' || c.nature === 'dual') return true;
      // Any contact with friend keywords in relation → friend
      if (friendKeywords.some(k => rel.toLowerCase().includes(k.toLowerCase()))) return true;
      return false;
    };
    const isCollaborator = (c) => c.nature === 'leverage' || c.nature === 'dual';

    // Build contact lookup
    const contactMap = {};
    contacts.forEach(c => contactMap[c.id] = c);

    // Classify timeline entries by role
    const friendTimeline = monthTimeline.filter(t => contactMap[t.contact] && isFriend(contactMap[t.contact]));
    const familyTimeline = monthTimeline.filter(t => contactMap[t.contact] && isFamily(contactMap[t.contact]));
    const collabTimeline = monthTimeline.filter(t => contactMap[t.contact] && isCollaborator(contactMap[t.contact]));

    // Presence events this month
    const friendPresence = contacts.filter(isFriend).reduce((sum, c) => sum + (c.presence_events?.length || 0), 0);
    const familyPresence = contacts.filter(isFamily).reduce((sum, c) => sum + (c.presence_events?.length || 0), 0);

    // Todos done (approximate: count todos with status done — but API only returns pending)
    // Use total todos as proxy for collaborator activity
    const collabTodos = todos.filter(t => contactMap[t.contact] && isCollaborator(contactMap[t.contact]));

    // Upcoming important dates (next 30 days)
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const upcomingDates = [];
    contacts.forEach(c => {
      (c.important_dates || []).forEach(dt => {
        const dateStr = dt.date || '';
        if (dateStr.length >= 5) {
          // Format MM-DD or MM-DD-YYYY
          const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
          const thisYear = `${today.getFullYear()}-${mmdd}`;
          const dDate = new Date(thisYear);
          const delta = Math.floor((dDate - today) / 86400000);
          if (delta >= 0 && delta <= 30) {
            upcomingDates.push({ name: c.name, date: mmdd, label: dt.label || '', delta, contactId: c.id });
          }
        }
      });
    });
    upcomingDates.sort((a, b) => a.delta - b.delta);

    let html = `
      <!-- Stats card -->
      <div class="mine-card">
        <div class="mine-card-title">${d.mine_overview_title}</div>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1;text-align:center;min-width:0">
            <div style="font-size:1.6em;font-weight:600;color:var(--accent)">${contacts.length}</div>
            <div style="font-size:.72em;color:var(--dim);white-space:nowrap">${d.mine_contacts_total}</div>
          </div>
          <div style="flex:1;text-align:center;min-width:0">
            <div style="font-size:1.6em;font-weight:600;color:var(--text)">${todos.length}</div>
            <div style="font-size:.72em;color:var(--dim);white-space:nowrap">${d.mine_todos_pending}</div>
          </div>
          <div style="flex:1;text-align:center;min-width:0">
            <div style="font-size:1.6em;font-weight:600;color:var(--green)">${monthTimeline.length}</div>
            <div style="font-size:.72em;color:var(--dim);white-space:nowrap">${d.mine_interactions}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="mine-tag leverage">${d.mine_leverage} ${leverage}</span>
          <span class="mine-tag nurture">${d.mine_nurture} ${nurture}</span>
          ${dual > 0 ? `<span class="mine-tag dual">${d.mine_dual} ${dual}</span>` : ''}
        </div>
      </div>
      <!-- F5: Health ring -->
      <div class="mine-card">
        <div class="mine-card-title">${zh ? '关系健康度' : 'Relationship Health'}</div>
        <div class="health-ring">
          ${healthRingSvg(monthContacts.size, contacts.length)}
          <div class="info">
            <b>${monthContacts.size}/${contacts.length}</b><br>
            ${zh ? `本月已联系 ${monthContacts.size} 人，覆盖率 ${contacts.length > 0 ? Math.round(monthContacts.size/contacts.length*100) : 0}%` : `${monthContacts.size} contacted this month, ${contacts.length > 0 ? Math.round(monthContacts.size/contacts.length*100) : 0}% coverage`}
          </div>
        </div>
      </div>
    `;

    // ── Three-role dashboard ──
    const roleCard = (icon, label, interactions, presence, extra) => `
      <div class="mine-card">
        <div class="role-header" style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:1.1em">${icon}</span>
          <span class="mine-card-title" style="margin:0">${label}</span>
        </div>
        <div style="font-size:.78em;color:var(--dim);margin-bottom:6px">${interactions} ${d.role_interactions}${presence > 0 ? ` · ${presence} ${d.role_presence}` : ''}</div>
        ${extra || ''}
      </div>
    `;

    // Friend role
    let friendExtra = '';
    if (friendTimeline.length > 0) {
      friendTimeline.slice(0, 3).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        friendExtra += `<div class="mine-detail-item">· ${escapeHtml(name)}：${escapeHtml((t.summary || '').substring(0, 50))}</div>`;
      });
    }
    html += roleCard('🌱', d.role_friend, friendTimeline.length, friendPresence, friendExtra);

    // Family role
    let familyExtra = '';
    if (familyTimeline.length > 0) {
      familyTimeline.slice(0, 3).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        familyExtra += `<div class="mine-detail-item">· ${escapeHtml(name)}：${escapeHtml((t.summary || '').substring(0, 50))}</div>`;
      });
    }
    html += roleCard('🏡', d.role_family, familyTimeline.length, familyPresence, familyExtra);

    // Collaborator role
    let collabExtra = '';
    if (collabTodos.length > 0) {
      collabExtra += `<div style="font-size:.78em;color:var(--dim);margin-bottom:4px">${collabTodos.length} ${d.role_todos_done}</div>`;
      collabTodos.slice(0, 3).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        collabExtra += `<div class="mine-detail-item">· ${escapeHtml((t.task || '').substring(0, 50))}${name ? ` [${escapeHtml(name)}]` : ''}</div>`;
      });
    }
    if (collabTimeline.length > 0) {
      collabExtra += `<div style="font-size:.78em;color:var(--dim);margin:6px 0 4px">${collabTimeline.length} ${d.role_interactions}</div>`;
      collabTimeline.slice(0, 2).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        collabExtra += `<div class="mine-detail-item">· ${escapeHtml(name)}：${escapeHtml((t.summary || '').substring(0, 50))}</div>`;
      });
    }
    html += roleCard('🤝', d.role_collaborator, collabTimeline.length, 0, collabExtra);

    // ── Upcoming important dates ──
    if (upcomingDates.length > 0) {
      html += `<div class="mine-section-title">${d.detail_dates}</div>`;
      html += `<div class="mine-card">`;
      upcomingDates.slice(0, 5).forEach(dt => {
        const deltaLabel = dt.delta === 0 ? d.mine_today : `${dt.delta}${d.mine_days_left}`;
        html += `<div class="mine-detail-date" style="cursor:pointer" onclick="openContactDetail('${escapeHtml(dt.contactId)}')"><span class="icon">📅</span><span>${escapeHtml(dt.name)} — ${escapeHtml(dt.date)} ${escapeHtml(dt.label)} <span style="color:var(--accent)">(${deltaLabel})</span></span></div>`;
      });
      html += `</div>`;
    }

    // ── Recent interactions ──
    if (allTimeline.length > 0) {
      html += `<div class="mine-section-title">${d.mine_interactions}</div>`;
      html += `<div class="mine-card">`;
      allTimeline.slice(0, 5).forEach(t => {
        const dt = (t.date || '').substring(5) || '';
        const contactName = contactMap[t.contact]?.name || t.contact || '';
        const summary = (t.summary || t.action || '').substring(0, 60);
        html += `<div class="mine-contact" style="cursor:pointer" onclick="openContactDetail('${escapeHtml(t.contact || '')}')"><div><div class="mine-contact-name">${escapeHtml(contactName)}</div><div class="mine-contact-sub">${dt} · ${escapeHtml(summary)}</div></div></div>`;
      });
      html += `</div>`;
    }

    if (contacts.length === 0 && todos.length === 0 && allTimeline.length === 0) {
      html = `<div class="mine-empty">${d.mine_empty}</div>`;
    }

    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

// ── Contacts tab ──

let contactsGroupBy = 'relation';
let contactsCollapsedGroups = new Set();

async function loadContactsTab(keyword) {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  try {
    const [res, tlRes] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/timeline').catch(() => ({ timeline: [] })),
    ]);
    let contacts = res.contacts || [];
    mineCache.contacts = contacts;
    mineCache.timeline = tlRes.timeline || [];

    // Search input (never rebuilt during search) + results container
    let html = `<input class="mine-search" placeholder="${d.mine_search_ph}" id="mineSearchInput" autocomplete="off">`;
    html += `<div id="contactsResults"></div>`;
    content.innerHTML = html;

    // Wire up search with IME composition guard
    const searchInput = document.getElementById('mineSearchInput');
    let isComposing = false;
    searchInput.addEventListener('compositionstart', () => { isComposing = true; });
    searchInput.addEventListener('compositionend', () => {
      isComposing = false;
      onContactsSearch(searchInput.value);
    });
    searchInput.addEventListener('input', () => {
      if (!isComposing) onContactsSearch(searchInput.value);
    });

    // Render initial content into results container
    if (keyword) {
      onContactsSearch(keyword);
    } else {
      renderContactsResults('', d);
    }
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

function renderContactsResults(keyword, d) {
  const resultsEl = document.getElementById('contactsResults');
  if (!resultsEl) return;
  const contacts = mineCache.contacts || [];
  const kw = (keyword || '').trim().toLowerCase();

  if (kw) {
    const filtered = contacts.filter(c =>
      (c.name || '').toLowerCase().includes(kw) ||
      (c.relation || '').toLowerCase().includes(kw) ||
      (c.role || '').toLowerCase().includes(kw) ||
      (c.company || '').toLowerCase().includes(kw) ||
      (c.aliases || []).some(a => (a || '').toLowerCase().includes(kw))
    );
    let html = `<div class="mine-section-title">${filtered.length} ${d.mine_contacts_total}</div>`;
    if (filtered.length === 0) {
      html += `<div class="mine-empty">${d.mine_empty}</div>`;
    } else {
      html += `<div class="mine-card">`;
      filtered.forEach(c => html += renderContactItem(c, d));
      html += `</div>`;
    }
    resultsEl.innerHTML = html;
  } else {
    // No keyword → show subtabs + group list
    let html = `<div class="mine-subtab" id="contactsSubtab">
      <button class="mine-subtab-item active" onclick="switchContactsSubtab('all')">${d.mine_all}</button>
      <button class="mine-subtab-item" onclick="switchContactsSubtab('leverage')">🌳 ${d.mine_leverage}</button>
      <button class="mine-subtab-item" onclick="switchContactsSubtab('nurture')">🌸 ${d.mine_nurture}</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button onclick="document.getElementById('importFileInput').click()" style="flex:1;padding:10px;background:var(--surface);border:1px dashed var(--accent);border-radius:10px;cursor:pointer;font-family:inherit;font-size:.85em;color:var(--accent)">📥 ${currentLang==='zh'?'导入联系人（名片/文件）':'Import contacts (card/file)'}</button>
    </div>
    <input type="file" id="importFileInput" style="display:none" accept=".vcf,.vcard,.csv,.txt,.xlsx,.xls,.docx,.doc,.pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp" onchange="handleImportFile(this.files[0])">
    <div id="importStatus" style="display:${window._lastImportResult?'block':'none'};padding:12px 16px;font-size:.85em">${window._lastImportResult||''}</div>`;
    html += `<div class="mine-group-bar">
      <span style="font-size:.75em;color:var(--dimmer)">${d.group_by}:</span>
      <select class="mine-group-select" onchange="changeGroupBy(this.value)">
        <option value="relation" ${contactsGroupBy==='relation'?'selected':''}>${d.group_relation}</option>
        <option value="company" ${contactsGroupBy==='company'?'selected':''}>${d.group_company}</option>
        <option value="tag" ${contactsGroupBy==='tag'?'selected':''}>${d.group_tag}</option>
        <option value="strength" ${contactsGroupBy==='strength'?'selected':''}>${d.group_strength}</option>
        <option value="cooldown" ${contactsGroupBy==='cooldown'?'selected':''}>${d.group_cooldown}</option>
      </select>
    </div>`;
    html += `<div id="contactsList"></div>`;
    resultsEl.innerHTML = html;
    renderContactsList('all', d);
  }
}

// ── File import: upload file → backend AI extracts contacts → batch import ──
async function handleImportFile(file) {
  if (!file) return;
  const statusEl = document.getElementById('importStatus');
  if (!statusEl) return;
  statusEl.style.display = 'block';
  statusEl.innerHTML = `📄 ${currentLang==='zh'?'正在上传':'Uploading'} <b>${escapeHtml(file.name)}</b>…`;

  const token = await getClerkToken();
  if (!token) { statusEl.innerHTML = '❌ 请先登录'; return; }

  try {
    const lowerName = file.name.toLowerCase();
    console.log('[import] handleImportFile called, bridgeReady:', bridgeReady, 'tunnel:', AGENT_TUNNEL_URL);

    // Read file as base64 (all file types)
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    console.log('[import] base64 ready, size:', base64.length);

    // Route 1: Local agent connected → send to agent (Devin CLI / GLM)
    if (bridgeReady && AGENT_TUNNEL_URL) {
      console.log('[import] Route 1: sending to agent');
      statusEl.innerHTML = `🤖 ${currentLang==='zh'?'AI (GLM) 正在解析文件…':'AI (GLM) parsing file…'}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min for large files
        const resp = await fetch(`${AGENT_TUNNEL_URL}/ai/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, filename: file.name }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log('[import] agent response:', resp.status);
        const data = await resp.json();
        console.log('[import] agent data:', JSON.stringify(data).slice(0, 200));
        if (resp.ok && data.imported !== undefined) {
          const skipped = data.skipped || 0;
          const names = data.extracted_names || [];
          const resultHtml = `✅ ${currentLang==='zh'?'导入完成':'Import done'}: <b>${data.imported}</b> ${currentLang==='zh'?'位联系人':'contacts'}${skipped > 0 ? ` (${skipped} ${currentLang==='zh'?'已存在':'duplicates'})` : ''}${names.length ? ` — ${currentLang==='zh'?'前几名':'first names'}: ${names.join(', ')}` : ''}`;
          statusEl.innerHTML = resultHtml;
          window._lastImportResult = resultHtml;
          loadContactsTab();
          return;
        } else {
          statusEl.innerHTML = `❌ ${data.error || 'Import failed'}`;
          window._lastImportResult = null;
          return;
        }
      } catch(e) {
        console.log('[import] Agent failed:', e.message, '→ falling back to cloud');
        statusEl.innerHTML = `📄 ${currentLang==='zh'?'Agent 不可用，切换到云端…':'Agent unavailable, using cloud…'}`;
      }
    } else {
      console.log('[import] Route 1 skipped: bridgeReady=', bridgeReady, 'tunnel=', AGENT_TUNNEL_URL);
    }

    // Route 2: Fallback to cloud Worker (MiniMax-M3)
    statusEl.innerHTML = `🤖 ${currentLang==='zh'?'AI 正在识别并提取联系人…':'AI extracting contacts…'}`;
    const resp = await fetch(`${CLOUD_URL}/ai/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, base64, filename: file.name, mime_type: file.type }),
    });
    const data = await resp.json();
    if (resp.ok && data.imported !== undefined) {
        const skipped = data.skipped || 0;
        const msg = data.message || '';
        const resultHtml = `✅ ${currentLang==='zh'?'导入完成':'Import done'}: <b>${data.imported}</b> ${currentLang==='zh'?'位联系人':'contacts'}${skipped > 0 ? ` (${skipped} ${currentLang==='zh'?'已存在':'duplicates'})` : ''}${msg ? ` — ${msg}` : ''}`;
        statusEl.innerHTML = resultHtml;
        window._lastImportResult = resultHtml;
        loadContactsTab();
      } else {
        statusEl.innerHTML = `❌ ${data.error || 'Import failed'}`;
        window._lastImportResult = null;
      }
  } catch (e) {
    statusEl.innerHTML = `❌ ${e.message}`;
  }
}

function changeGroupBy(mode) {
  contactsGroupBy = mode;
  contactsCollapsedGroups = new Set();
  renderContactsList(currentContactsFilter || 'all', I18N[currentLang]);
}

function toggleGroup(groupKey) {
  if (contactsCollapsedGroups.has(groupKey)) {
    contactsCollapsedGroups.delete(groupKey);
  } else {
    contactsCollapsedGroups.add(groupKey);
  }
  const header = document.querySelector(`[data-group-key="${CSS.escape(groupKey)}"]`);
  const body = document.querySelector(`[data-group-body="${CSS.escape(groupKey)}"]`);
  if (header) header.classList.toggle('collapsed');
  if (body) body.classList.toggle('collapsed');
}

function renderContactItem(c, d) {
  const nature = c.nature === 'nurture' ? 'nurture' : (c.nature === 'dual' ? 'dual' : 'leverage');
  const natureLabel = nature === 'leverage' ? d.mine_leverage : (nature === 'nurture' ? d.mine_nurture : d.mine_dual);
  const sub = [c.relation || c.role || '', c.company || ''].filter(Boolean).join(' · ');
  // Cooldown warning for leverage/dual contacts
  let cooldownHtml = '';
  if (nature !== 'nurture' && mineCache.timeline) {
    const cd = getCooldownInfo(c, mineCache.timeline);
    if (cd && cd.urgent) {
      const daysLabel = cd.days >= 999 ? '从未' : `${cd.days}${d.cooldown_warning}`;
      cooldownHtml = `<div style="font-size:.7em;color:var(--accent);margin-top:2px">⚠️ ${daysLabel} · ${d.cooldown_urgent}</div>`;
    }
  }
  return `<div class="mine-contact" style="cursor:pointer" onclick="openContactDetail('${escapeHtml(c.id)}')"><div><div class="mine-contact-name">${escapeHtml(c.name || '')}</div><div class="mine-contact-sub">${escapeHtml(sub)}</div>${cooldownHtml}</div><span class="mine-tag ${nature}">${natureLabel}</span></div>`;
}

let currentContactsFilter = 'all';

function switchContactsSubtab(subtab) {
  currentContactsFilter = subtab;
  document.querySelectorAll('#contactsSubtab .mine-subtab-item').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(subtab === 'leverage' ? '🌳' : subtab === 'nurture' ? '🌸' : I18N[currentLang].mine_all));
  });
  renderContactsList(subtab, I18N[currentLang]);
}

function getContactGroups(contacts, groupBy, d) {
  const groups = new Map(); // key -> { label, contacts[] }

  for (const c of contacts) {
    let keys = [];
    if (groupBy === 'relation') {
      const rel = (c.relation || c.role || '').trim();
      keys = [rel || d.group_unGrouped];
    } else if (groupBy === 'company') {
      const comp = (c.company || '').trim();
      keys = [comp || d.group_unGrouped];
    } else if (groupBy === 'tag') {
      const tags = c.tags || [];
      keys = tags.length > 0 ? tags : [d.group_unGrouped];
    } else if (groupBy === 'strength') {
      const s = c.strength || 0;
      if (s >= 4) keys = [d.group_core];
      else if (s === 3) keys = [d.group_important];
      else keys = [d.group_casual];
    } else if (groupBy === 'cooldown') {
      if (c.nature === 'nurture') {
        keys = ['🌸 ' + d.mine_nurture];
      } else {
        const cd = getCooldownInfo(c, mineCache.timeline || []);
        if (!cd || cd.days >= 999) keys = [d.group_never];
        else if (cd.urgent) keys = [d.group_urgent];
        else if (cd.days <= 7) keys = [d.group_recent];
        else keys = [d.group_normal];
      }
    }
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, { label: key, contacts: [] });
      groups.get(key).contacts.push(c);
    }
  }

  // Sort groups
  const entries = [...groups.entries()];
  if (groupBy === 'strength') {
    const order = [d.group_core, d.group_important, d.group_casual];
    entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  } else if (groupBy === 'cooldown') {
    const order = [d.group_urgent, d.group_never, d.group_normal, d.group_recent, '🌸 ' + d.mine_nurture];
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  } else {
    // Sort by group size desc, ungrouped last
    entries.sort((a, b) => {
      if (a[0] === d.group_unGrouped) return 1;
      if (b[0] === d.group_unGrouped) return -1;
      return b[1].contacts.length - a[1].contacts.length;
    });
  }
  return entries;
}

function renderContactsList(filter, d) {
  const contacts = mineCache.contacts || [];
  let filtered = contacts;
  if (filter === 'leverage') filtered = contacts.filter(c => c.nature === 'leverage' || c.nature === 'dual');
  else if (filter === 'nurture') filtered = contacts.filter(c => c.nature === 'nurture' || c.nature === 'dual');
  const el = document.getElementById('contactsList');
  if (!el) return;
  if (filtered.length === 0) {
    el.innerHTML = `<div class="mine-empty">${d.mine_empty_contacts}</div>`;
    return;
  }

  const groups = getContactGroups(filtered, contactsGroupBy, d);

  let html = '';
  for (const [groupKey, group] of groups) {
    const collapsed = contactsCollapsedGroups.has(groupKey);
    const groupIcon = contactsGroupBy === 'cooldown' && groupKey === d.group_urgent ? '⚠️'
      : contactsGroupBy === 'cooldown' && groupKey === d.group_never ? '🔴'
      : contactsGroupBy === 'cooldown' && groupKey === d.group_recent ? '✅'
      : contactsGroupBy === 'strength' && groupKey === d.group_core ? '⭐'
      : '📁';
    html += `<div class="mine-group-header${collapsed ? ' collapsed' : ''}" data-group-key="${escapeHtml(groupKey)}" onclick="toggleGroup('${escapeHtml(groupKey).replace(/'/g,"\\'")}')">`;
    html += `<span>${groupIcon}</span>`;
    html += `<span>${escapeHtml(group.label)}</span>`;
    html += `<span class="mine-group-count">${group.contacts.length}</span>`;
    html += `<span class="mine-group-toggle">▾</span>`;
    html += `</div>`;
    html += `<div class="mine-group-body${collapsed ? ' collapsed' : ''}" data-group-body="${escapeHtml(groupKey)}">`;
    html += `<div class="mine-card">`;
    group.contacts.forEach(c => html += renderContactItem(c, d));
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

function onContactsSearch(val) {
  const d = I18N[currentLang];
  const keyword = (val || '').trim();
  if (!keyword) {
    // Clear search → restore full list
    renderContactsResults('', d);
    return;
  }
  renderContactsResults(keyword, d);
}

// ── Contact detail drawer ──

async function openContactDetail(contactId) {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  let contact = (mineCache.contacts || []).find(c => c.id === contactId);
  // Fallback to chatDataCache (loaded on main chat page)
  if (!contact) contact = (chatDataCache.contacts || []).find(c => c.id === contactId);
  // Fallback: try matching by name (old timeline data may store name instead of id)
  if (!contact) {
    contact = (mineCache.contacts || []).find(c => c.name === contactId) ||
              (chatDataCache.contacts || []).find(c => c.name === contactId);
  }
  if (!contact) return;

  // Show drawer immediately with basic info
  document.getElementById('detailName').textContent = contact.name || '';
  const subParts = [contact.relation || contact.role || '', contact.company || '', contact.title || ''].filter(Boolean);
  document.getElementById('detailSub').textContent = subParts.join(' · ');
  document.getElementById('detailBody').innerHTML = `<div class="mine-empty">${d.detail_loading}</div>`;
  document.getElementById('contactDetailOverlay').classList.add('show');
  document.getElementById('contactDetail').classList.add('show');

  // Add edit/delete/meeting-prep buttons to header (recreate each time to update contactId)
  const headerEl = document.querySelector('#contactDetail .mine-detail-header');
  if (headerEl) {
    const existing = headerEl.querySelector('.detail-btns');
    if (existing) existing.remove();
    const btnContainer = document.createElement('div');
    btnContainer.className = 'detail-btns';
    btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    btnContainer.innerHTML = `
      <button class="detail-prep-btn" onclick="meetingPrepDetail('${contactId}')" class="btn-outline-md">${d.meeting_prep}</button>
      <button class="detail-edit-btn" onclick="editContactForm('${contactId}')" class="btn-outline-md">${d.edit_contact}</button>
      <button class="detail-del-btn" onclick="deleteContact('${contactId}')" class="btn-outline-md">${d.delete_contact}</button>
    `;
    headerEl.appendChild(btnContainer);
  }

  try {
    // Fetch timeline for this contact
    let timeline = [];
    try {
      const tlRes = await mineApi(`/data/timeline?contact_id=${encodeURIComponent(contactId)}`);
      timeline = tlRes.timeline || [];
    } catch (e) {}

    let html = '';

    // Aliases / nicknames
    const aliases = contact.aliases || contact.alias || [];
    if (aliases.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${zh ? '昵称' : 'Nicknames'}</div>`;
      html += `<div class="mine-detail-tags">`;
      aliases.forEach(a => html += `<span class="mine-detail-tag">${escapeHtml(a)}</span>`);
      html += `</div></div>`;
    }

    // Tags
    if (contact.tags && contact.tags.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_tags}</div>`;
      html += `<div class="mine-detail-tags">`;
      contact.tags.forEach(t => html += `<span class="mine-detail-tag">${escapeHtml(t)}</span>`);
      html += `</div></div>`;
    }

    // Contact info (phone / email)
    if (contact.phone || contact.email) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${zh ? '联系方式' : 'Contact'}</div>`;
      if (contact.phone) html += `<div class="mine-detail-item"><span style="color:var(--dim)">📱 </span>${escapeHtml(contact.phone)}</div>`;
      if (contact.email) html += `<div class="mine-detail-item"><span style="color:var(--dim)">✉️ </span>${escapeHtml(contact.email)}</div>`;
      html += `</div>`;
    }

    // Leverage info
    const hasLeverage = contact.nature === 'leverage' || contact.nature === 'dual' || contact.leverage;
    if (hasLeverage) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_leverage}</div>`;
      if (contact.leverage) {
        html += `<div class="mine-detail-leverage">`;
        if (contact.leverage.goals) html += `<div><span class="label">${d.detail_goals}: </span><span class="value">${escapeHtml(contact.leverage.goals.join(', '))}</span></div>`;
        if (contact.leverage.how) html += `<div><span class="label">${d.detail_how}: </span><span class="value">${escapeHtml(contact.leverage.how)}</span></div>`;
        if (contact.leverage.direction) html += `<div><span class="label">${d.detail_direction}: </span><span class="value">${escapeHtml(contact.leverage.direction)}</span></div>`;
        if (contact.leverage.confirmed) html += `<div class="label" style="margin-top:4px">✓ ${escapeHtml(contact.leverage.confirmed)}</div>`;
        html += `</div>`;
      } else {
        html += `<div class="mine-detail-item">${d.detail_no_leverage}</div>`;
      }
      html += `</div>`;
    }

    // Nurture info
    const hasNurture = contact.nature === 'nurture' || contact.nature === 'dual' || contact.nurture;
    if (hasNurture) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_nurture}</div>`;
      const n = contact.nurture || {};
      if (n.bond || contact.important_dates?.length || contact.memories?.length || contact.presence_events?.length) {
        html += `<div class="mine-detail-nurture">`;
        if (n.bond) html += `<div><span class="label">${d.detail_bond}: </span><span class="value">${escapeHtml(n.bond)}</span></div>`;
        html += `</div>`;
      } else {
        html += `<div class="mine-detail-item">${d.detail_no_nurture}</div>`;
      }
      html += `</div>`;
    }

    // Important dates
    if (contact.important_dates && contact.important_dates.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_dates}</div>`;
      contact.important_dates.forEach(dt => {
        html += `<div class="mine-detail-date"><span class="icon">📅</span><span>${escapeHtml(dt.date || '')} — ${escapeHtml(dt.label || '')}</span></div>`;
      });
      html += `</div>`;
    }

    // Memories
    if (contact.memories && contact.memories.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_memories}</div>`;
      contact.memories.forEach(m => {
        html += `<div class="mine-detail-item">${escapeHtml(typeof m === 'string' ? m : (m.content || m.text || JSON.stringify(m)))}</div>`;
      });
      html += `</div>`;
    }

    // Presence events
    if (contact.presence_events && contact.presence_events.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_presence}</div>`;
      contact.presence_events.forEach(p => {
        html += `<div class="mine-detail-item">${escapeHtml(typeof p === 'string' ? p : (p.event || p.summary || JSON.stringify(p)))}</div>`;
      });
      html += `</div>`;
    }

    // Timeline
    html += `<div class="mine-detail-section">`;
    html += `<div class="mine-detail-section-title" style="display:flex;justify-content:space-between;align-items:center">${d.detail_timeline}
      <button onclick="showTimelineForm('${escapeHtml(contactId)}')" style="font-size:.75em;padding:3px 10px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">+ ${d.tl_add}</button>
    </div>`;
    html += `<div id="timelineForm" style="display:none;margin-bottom:8px"></div>`;
    if (timeline.length > 0) {
      timeline.forEach(t => {
        const dt = (t.date || '').substring(5) || '';
        const summary = t.summary || t.action || '';
        const tId = escapeHtml(t.id);
        html += `<div class="mine-detail-item" id="tl-${tId}" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;cursor:pointer" onclick="showInteractionDetail('${tId}','${escapeHtml(contactId)}')"><span style="color:var(--dim)">${dt}</span> ${escapeHtml(summary)}</div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button onclick="showInteractionDetail('${tId}','${escapeHtml(contactId)}')" class="btn-outline-xs">${zh?'详情':'Detail'}</button>
            <button onclick="showTimelineForm('${escapeHtml(contactId)}','${tId}')" class="btn-outline-xs">${d.tl_edit}</button>
            <button onclick="deleteTimelineEntry('${tId}','${escapeHtml(contactId)}',event)" class="btn-outline-xs">${d.tl_delete}</button>
          </div>
        </div>`;
      });
    } else {
      html += `<div class="mine-detail-item" style="color:var(--dimmer)">${d.detail_no_timeline}</div>`;
    }
    html += `</div>`;

    document.getElementById('detailBody').innerHTML = html;
    // Store current contactId + timeline for form use
    window._currentDetailContactId = contactId;
    window._currentDetailTimeline = timeline;
  } catch (e) {
    document.getElementById('detailBody').innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

// ── Timeline CRUD in contact detail ──

function showTimelineForm(contactId, tlId) {
  const d = I18N[currentLang];
  const form = document.getElementById('timelineForm');
  if (!form) return;
  const editing = tlId ? (window._currentDetailTimeline || []).find(t => t.id === tlId) : null;
  const today = localDateStr();

  form.style.display = 'block';
  form.innerHTML = `
    <div class="mine-card" style="display:flex;flex-direction:column;gap:8px;padding:10px">
      <input id="tl_summary_input" type="text" value="${escapeHtml(editing?.summary || '')}" placeholder="${d.tl_summary_ph}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.9em">
      <input id="tl_date_input" type="date" value="${escapeHtml((editing?.date || today).substring(0,10))}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.9em">
      <div style="display:flex;gap:8px">
        <button onclick="saveTimelineEntry('${escapeHtml(contactId)}','${escapeHtml(tlId || '')}')" style="flex:1;padding:6px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.85em">${d.tl_save}</button>
        <button onclick="hideTimelineForm()" style="flex:1;padding:6px;background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;font-size:.85em;color:var(--dim)">${d.tl_cancel}</button>
      </div>
    </div>
  `;
  document.getElementById('tl_summary_input')?.focus();
}

function hideTimelineForm() {
  const form = document.getElementById('timelineForm');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
}

async function saveTimelineEntry(contactId, tlId) {
  const summary = document.getElementById('tl_summary_input')?.value?.trim();
  if (!summary) return;
  const date = document.getElementById('tl_date_input')?.value || localDateStr();
  try {
    if (tlId) {
      // Edit existing via PUT
      await mineApi('/data/timeline', 'PUT', { id: tlId, summary, date, contact_id: contactId });
    } else {
      // Add new via POST
      await mineApi('/data/timeline', 'POST', { summary, date, contact_id: contactId });
    }
    hideTimelineForm();
    // Reload contact detail to refresh timeline
    await openContactDetail(contactId);
  } catch (e) {
    alert(e.message);
  }
}

async function deleteTimelineEntry(tlId, contactId, ev) {
  const d = I18N[currentLang];
  const ok = await confirmPop(ev, currentLang === 'zh' ? '确认删除这条互动记录？' : 'Delete this interaction?');
  if (!ok) return;
  try {
    await mineApi(`/data/timeline?id=${encodeURIComponent(tlId)}`, 'DELETE');
    await openContactDetail(contactId);
  } catch (e) {
    alert(e.message);
  }
}

function closeContactDetail() {
  document.getElementById('contactDetailOverlay').classList.remove('show');
  document.getElementById('contactDetail').classList.remove('show');
}

// ── Weekly tab ──

async function loadWeeklyTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_weekly_loading_ai}</div>`;
  try {
    // Use structured weekly_report endpoint
    const reportRes = await mineApi('/ai/weekly_report', 'POST', {});
    const report = reportRes.report || {};
    const raw = reportRes.raw_data || {};

    // Week range
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const fmtDate = (dt) => `${dt.getMonth() + 1}月${dt.getDate()}日`;
    const weekRange = `${fmtDate(weekAgo)} - ${fmtDate(now)}`;

    let html = `<div class="mine-card"><div class="mine-card-title">📋 ${d.mine_weekly_title}</div><div class="mine-contact-sub">${weekRange}</div><div style="display:flex;gap:8px;margin-top:8px"><button onclick="shareWeeklyReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${currentLang==='zh'?'📤 分享':'📤 Share'}</button><button onclick="exportReportPDF('weekly', window._weeklyReportData?.report || {})" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">${currentLang==='zh'?'📄 PDF':'📄 PDF'}</button></div></div>`;

    // Greeting
    if (report.greeting) {
      html += `<div class="mine-card" style="font-size:.9em;line-height:1.7">${escapeHtml(report.greeting)}</div>`;
    }

    // Section 1: This week review
    html += `<div class="mine-section-title">${d.mine_weekly_review}</div>`;
    html += `<div class="mine-card">`;
    const review = report.review || raw.weekSummary || {};
    if (review.interactions !== undefined) {
      html += `<div style="display:flex;gap:16px;padding:4px 0;font-size:.85em">`;
      html += `<span style="color:var(--dim)">${review.interactions || 0} 次互动</span>`;
      html += `<span style="color:var(--dim)">${review.completed_todos || 0} 个完成</span>`;
      html += `<span style="color:var(--dim)">${review.new_todos || 0} 个待办</span>`;
      html += `</div>`;
      if (review.summary) html += `<div style="font-size:.88em;line-height:1.6;margin-top:4px">${escapeHtml(review.summary)}</div>`;
    } else {
      html += `<div class="mine-empty">${d.mine_empty_timeline}</div>`;
    }
    html += `</div>`;

    // Section 2: Upcoming dates
    const upcoming = report.upcoming_dates || raw.upcomingDates || [];
    if (upcoming.length > 0) {
      html += `<div class="mine-section-title">📅 ${currentLang==='zh'?'近期重要日期':'Upcoming dates'}</div>`;
      html += `<div class="mine-card">`;
      upcoming.forEach(dt => {
        const dateStr = (dt.date || '').slice(5) || dt.date;
        html += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(dt.name)}</strong> — ${escapeHtml(dateStr)} ${escapeHtml(dt.label || '')}</div></div>`;
      });
      html += `</div>`;
    }

    // Section 3: Who to reach out
    html += `<div class="mine-section-title">${d.mine_weekly_suggest}</div>`;
    html += `<div class="mine-card">`;
    const suggestions = report.suggest_contact || [];
    if (suggestions.length > 0) {
      suggestions.forEach(s => {
        html += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(s.name || '')}</strong> — ${escapeHtml(s.reason || '')}</div>`;
        if (s.topic) html += `<div style="font-size:.78em;color:var(--dimmer);padding-left:12px">→ ${escapeHtml(s.topic)}</div>`;
        html += `</div>`;
      });
    } else {
      html += `<div class="mine-empty">${d.mine_no_suggestions}</div>`;
    }
    html += `</div>`;

    // Section 4: Todo reminders
    const todoReminders = report.todo_reminders || raw.pendingTodos || [];
    if (todoReminders.length > 0) {
      html += `<div class="mine-section-title">${d.mine_weekly_todos}</div>`;
      html += `<div class="mine-card">`;
      todoReminders.slice(0, 10).forEach(t => {
        html += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(t.task || t.content || '')}${t.contact ? ` <span class="mine-contact-sub">— ${escapeHtml(t.contact)}</span>` : ''}</div></div>`;
      });
      html += `</div>`;
    }

    // Closing
    if (report.closing) {
      html += `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>`;
    }

    content.innerHTML = html;
    // Store report data for sharing
    window._weeklyReportData = { report, raw, weekRange };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

async function doShareText(text) {
  const zh = currentLang === 'zh';
  showShareModal(text, zh);
}

// ── Share card generation + share modal ──

function buildShareCard(title, subtitle, sections, zh) {
  const card = document.createElement('div');
  card.id = 'shareCardTemp';
  card.style.cssText = 'position:fixed;left:-9999px;top:0;width:375px;background:linear-gradient(180deg,#f8f6f1 0%,#fff 30%);padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;color:#333;box-sizing:border-box';

  let sectionsHtml = '';
  for (const s of sections) {
    if (!s.items || s.items.length === 0) continue;
    sectionsHtml += `<div style="margin-top:18px">
      <div style="font-size:13px;font-weight:600;color:#c96442;margin-bottom:8px">${s.icon} ${s.title}</div>
      ${s.items.map(item => `<div style="font-size:12px;line-height:1.7;color:#555;padding:3px 0;padding-left:10px;border-left:2px solid #e8e0d6">${item}</div>`).join('')}
    </div>`;
  }

  card.innerHTML = `
    <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid #e8e0d6">
      <div style="font-size:18px;font-weight:700;color:#333">${title}</div>
      <div style="font-size:12px;color:#999;margin-top:6px">${subtitle}</div>
    </div>
    ${sectionsHtml}
    <div style="margin-top:24px;text-align:center;padding-top:16px;border-top:1px solid #e8e0d6">
      <div style="font-size:11px;color:#bbb">— Welian 小维 · welian.app —</div>
    </div>
  `;
  return card;
}

async function generateShareImage(cardEl) {
  document.body.appendChild(cardEl);
  try {
    const canvas = await html2canvas(cardEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f8f6f1',
      width: 375,
      windowWidth: 375,
    });
    return canvas;
  } finally {
    cardEl.remove();
  }
}

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// ── PDF export (calls pdf-sandbox service) ──

const PDF_SANDBOX_URL = (() => {
  // Local dev: localhost; production: set via window.WELIAN_PDF_URL or default to same host
  if (window.WELIAN_PDF_URL) return window.WELIAN_PDF_URL;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:8198';
  return 'https://pdf.welian.app'; // production URL (deploy pdf-sandbox here)
})();

async function exportReportPDF(type, report) {
  // Try local agent bridge first (if connected), then fallback to pdf-sandbox URL
  if (bridgeFrame && bridgeReady) {
    try {
      const result = await agentPDF(type, report);
      if (result && result.pdf) {
        // Decode base64 PDF and download
        const binary = atob(result.pdf);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || `welian_${type}_${new Date().toISOString().slice(0,10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
    } catch (e) {
      console.log('[PDF] Bridge route failed, trying pdf-sandbox URL:', e.message);
    }
  }

  // Fallback: direct fetch to pdf-sandbox URL (cloud mode)
  try {
    const resp = await fetch(`${PDF_SANDBOX_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, report }),
    });
    if (!resp.ok) throw new Error(`PDF service error: ${resp.status}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welian_${type}_${new Date().toISOString().slice(0,10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    alert(currentLang === 'zh' ? `PDF 导出失败：${e.message}\n\n请确认本地 agent 已连接，或 pdf-sandbox 服务可用。` : `PDF export failed: ${e.message}`);
  }
}

// Generate PDF via local agent bridge (proxies to pdf-sandbox on port 8198)
async function agentPDF(type, report) {
  if (!bridgeFrame || !bridgeReady) return null;
  return new Promise((resolve) => {
    const reqId = 'pdf_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.pdf) {
          resolve(msg.data);
        } else if (msg.data.type === 'error') {
          resolve({ error: true, message: msg.data.message });
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 30000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'pdf', id: reqId, type, report }
    }, '*');
  });
}

function showShareModal(text, zh, cardEl) {
  // Remove existing
  const existing = document.getElementById('shareModal');
  if (existing) existing.remove();

  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const canShareFiles = navigator.share && navigator.canShare && typeof navigator.canShare === 'function';

  const modal = document.createElement('div');
  modal.id = 'shareModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:16px;padding:24px 20px;max-width:340px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.2)';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:1em;font-weight:600;margin-bottom:16px;color:#333';
  title.textContent = zh ? '分享报告' : 'Share Report';
  panel.appendChild(title);

  // Image preview placeholder
  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'margin-bottom:16px;max-height:200px;overflow:hidden;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:80px';
  previewWrap.innerHTML = `<div style="color:#999;font-size:.8em">${zh ? '正在生成长图…' : 'Generating image…'}</div>`;
  panel.appendChild(previewWrap);

  // Buttons container
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center';
  panel.appendChild(btns);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = zh ? '关闭' : 'Close';
  closeBtn.style.cssText = 'width:100%;padding:10px;margin-top:12px;background:none;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:.85em;color:#666;font-family:inherit';
  closeBtn.onclick = () => modal.remove();
  panel.appendChild(closeBtn);

  modal.appendChild(panel);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);

  // Generate image
  let imageBlob = null;
  let imageCanvas = null;

  if (cardEl && typeof html2canvas !== 'undefined') {
    generateShareImage(cardEl).then(canvas => {
      imageCanvas = canvas;
      canvasToBlob(canvas).then(blob => {
        imageBlob = blob;
        const url = URL.createObjectURL(blob);
        previewWrap.innerHTML = `<img src="${url}" style="width:100%;display:block;border-radius:8px" />`;
        // Enable image-dependent buttons
        updateShareButtons();
      });
    }).catch(err => {
      previewWrap.innerHTML = `<div style="color:#e74c3c;font-size:.8em">${zh ? '图片生成失败' : 'Image generation failed'}</div>`;
      updateShareButtons();
    });
  } else {
    previewWrap.style.display = 'none';
    updateShareButtons();
  }

  function updateShareButtons() {
    btns.innerHTML = '';

    function addBtn(label, icon, color, onClick) {
      const btn = document.createElement('button');
      btn.innerHTML = `<span style="font-size:1.2em">${icon}</span><div style="font-size:.7em;margin-top:4px">${label}</div>`;
      btn.style.cssText = `width:72px;padding:12px 4px;background:#f8f6f1;border:none;border-radius:12px;cursor:pointer;font-family:inherit;color:${color};display:flex;flex-direction:column;align-items:center`;
      btn.onclick = onClick;
      btns.appendChild(btn);
    }

    // WeChat
    addBtn(zh ? '微信' : 'WeChat', '💬', '#07c160', async () => {
      if (isWeChat) {
        // In WeChat browser: copy image + guide to use top-right menu
        if (imageBlob) {
          try {
            const item = new ClipboardItem({ 'image/png': imageBlob });
            await navigator.clipboard.write([item]);
          } catch (e) {
            // Fallback: copy text
            try { await navigator.clipboard.writeText(text); } catch (e2) {}
          }
        } else {
          try { await navigator.clipboard.writeText(text); } catch (e) {}
        }
        showWeChatShareGuide(zh);
      } else if (canShareFiles && imageBlob) {
        // Non-WeChat with file share support: system share (WeChat appears as target)
        const file = new File([imageBlob], 'welian-report.png', { type: 'image/png' });
        try {
          await navigator.share({ files: [file], text });
        } catch (e) {
          // Fallback: download image
          downloadImage();
        }
      } else {
        // Desktop: download image, user can manually send to WeChat
        downloadImage();
      }
    });

    // Save image
    if (imageBlob) {
      addBtn(zh ? '保存图片' : 'Save', '📥', '#333', downloadImage);
    }

    // Copy text
    addBtn(zh ? '复制文字' : 'Copy Text', '📋', '#666', async () => {
      try {
        await navigator.clipboard.writeText(text);
        alert(zh ? '✓ 已复制' : '✓ Copied');
      } catch (e) {
        prompt(zh ? '复制以下文本：' : 'Copy:', text);
      }
    });

    // More (system share)
    if (navigator.share && !isWeChat) {
      addBtn(zh ? '更多' : 'More', '⋯', '#999', async () => {
        try {
          if (canShareFiles && imageBlob) {
            const file = new File([imageBlob], 'welian-report.png', { type: 'image/png' });
            await navigator.share({ files: [file], text });
          } else {
            await navigator.share({ title: zh ? '小维报告' : 'Welian Report', text });
          }
        } catch (e) {}
      });
    }
  }

  function downloadImage() {
    if (!imageBlob) return;
    const url = URL.createObjectURL(imageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'welian-report.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function showWeChatShareGuide(zh) {
  const existing = document.getElementById('wechatShareGuide');
  if (existing) existing.remove();

  const guide = document.createElement('div');
  guide.id = 'wechatShareGuide';
  guide.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);display:flex;align-items:flex-start;justify-content:flex-end;padding:20px;cursor:pointer';
  guide.innerHTML = `
    <div style="color:#fff;text-align:right;padding-top:10px;max-width:280px">
      <div style="font-size:1.4em;margin-bottom:12px">👆</div>
      <div style="font-size:1em;font-weight:600;margin-bottom:8px">${zh ? '点击右上角 ··· 分享' : 'Tap ··· at top-right to share'}</div>
      <div style="font-size:.82em;opacity:.8;line-height:1.5">${zh ? '长图已复制，可选择「发送给朋友」或「分享到朋友圈」' : 'Image copied. Choose "Send to friend" or "Share to Moments"'}</div>
    </div>
  `;
  guide.onclick = () => guide.remove();
  document.body.appendChild(guide);
}

function shareWeeklyReport() {
  const data = window._weeklyReportData;
  if (!data) return;
  const { report, raw, weekRange } = data;
  const zh = currentLang === 'zh';
  let text = `📋 ${zh ? '社交周报' : 'Weekly Report'}\n${weekRange}\n\n`;
  if (report.greeting) text += `${report.greeting}\n\n`;
  const review = report.review || raw.weekSummary || {};
  if (review.interactions !== undefined) {
    text += zh ? `【本周回顾】\n${review.interactions||0} 次互动 · ${review.completed_todos||0} 个完成 · ${review.new_todos||0} 个待办\n` : `【Review】\n${review.interactions||0} interactions · ${review.completed_todos||0} done · ${review.new_todos||0} pending\n`;
    if (review.summary) text += `${review.summary}\n`;
    text += '\n';
  }
  const suggestions = report.suggest_contact || [];
  if (suggestions.length > 0) {
    text += zh ? `【该联系谁】\n` : `【Reach out】\n`;
    suggestions.forEach(s => {
      text += `· ${s.name||''} — ${s.reason||''}`;
      if (s.topic) text += ` → ${s.topic}`;
      text += '\n';
    });
    text += '\n';
  }
  const upcoming = report.upcoming_dates || raw.upcomingDates || [];
  if (upcoming.length > 0) {
    text += zh ? `【近期重要日期】\n` : `【Upcoming dates】\n`;
    upcoming.forEach(dt => { text += `· ${dt.name} — ${(dt.date||'').slice(5)} ${dt.label||''}\n`; });
    text += '\n';
  }
  const todoReminders = report.todo_reminders || raw.pendingTodos || [];
  if (todoReminders.length > 0) {
    text += zh ? `【待办提醒】\n` : `【Todo reminders】\n`;
    todoReminders.slice(0,5).forEach(t => { text += `· ${t.task||t.content||''}${t.contact ? ' — '+t.contact : ''}\n`; });
    text += '\n';
  }
  if (report.closing) text += `${report.closing}\n`;
  text += `\n— Welian 小维`;

  // Build share card
  const sections = [];
  if (report.greeting) sections.push({ icon: '💬', title: '', items: [escapeHtml(report.greeting)] });
  if (review.interactions !== undefined) {
    sections.push({
      icon: '📊', title: zh ? '本周回顾' : 'Review',
      items: [`${review.interactions||0} ${zh?'次互动':'interactions'} · ${review.completed_todos||0} ${zh?'个完成':'done'} · ${review.new_todos||0} ${zh?'个待办':'pending'}`, ...(review.summary ? [escapeHtml(review.summary)] : [])]
    });
  }
  if (suggestions.length > 0) {
    sections.push({ icon: '🤝', title: zh ? '该联系谁' : 'Reach out', items: suggestions.map(s => `${escapeHtml(s.name||'')} — ${escapeHtml(s.reason||'')}${s.topic ? ' → '+escapeHtml(s.topic) : ''}`) });
  }
  if (upcoming.length > 0) {
    sections.push({ icon: '📅', title: zh ? '近期重要日期' : 'Upcoming dates', items: upcoming.map(dt => `${escapeHtml(dt.name)} — ${(dt.date||'').slice(5)} ${escapeHtml(dt.label||'')}`) });
  }
  if (todoReminders.length > 0) {
    sections.push({ icon: '✅', title: zh ? '待办提醒' : 'Todo reminders', items: todoReminders.slice(0,5).map(t => `${escapeHtml(t.task||t.content||'')}${t.contact ? ' — '+escapeHtml(t.contact) : ''}`) });
  }
  const card = buildShareCard(zh ? '📋 社交周报' : '📋 Weekly Report', weekRange, sections, zh);
  showShareModal(text, zh, card);
}

async function loadBillingTab() {
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

function renderBillingTab(info, pricing, isAdmin) {
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
  PAY_AMOUNTS = {
    pro_monthly: proPrice,
    pro_yearly: proPriceYearly,
    '100': pack100Price,
    '500': pack500Price,
  };

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

function applyDiscount(percent) {
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
  PAY_AMOUNTS = discounted;
  const btnMap = { btn_pro_monthly: `$${discounted.pro_monthly}/mo`, btn_pro_yearly: `$${discounted.pro_yearly}/yr`, btn_credits_100: `$${discounted['100']}`, btn_credits_500: `$${discounted['500']}` };
  Object.entries(btnMap).forEach(([id, label]) => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = label;
  });
}

async function savePricing() {
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

async function paddleCheckout(product) {
  const token = await getClerkToken();
  if (!token) { alert(currentLang === 'zh' ? '请先登录' : 'Please sign in first'); return; }
  // Ensure Paddle is initialized (async init may still be in flight)
  if (!paddleInitialized) await initPaddle();
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/paddle/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ product, session_token: token }),
    });
    const data = await resp.json();
    console.log('[checkout] Response:', JSON.stringify({ price_id: data.price_id, discount_id: data.discount_id, error: data.error, product }));
    if (resp.ok && data.price_id) {
      if (typeof Paddle !== 'undefined') {
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
        Paddle.Checkout.open(checkoutOpts);
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

async function paddleCancelSub() {
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

async function doGiftCredits() {
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

async function doRedeemCoupon() {
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

// ── WeChat Pay flow ──

let PAY_AMOUNTS = {};

let currentOrder = null;

function openPayModal(type, id) {
  const d = I18N[currentLang];
  const amount = PAY_AMOUNTS[id] || 0;
  const name = type === 'upgrade' ? (id === 'pro_yearly' ? d.billing_pro_yearly : d.billing_pro_monthly) : (id === '500' ? d.billing_pack_500 : d.billing_pack_100);
  currentOrder = { type, id, amount, name };

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

function closePayModal() {
  document.getElementById('payOverlay').classList.remove('show');
  document.getElementById('payModal').classList.remove('show');
  currentOrder = null;
}

async function confirmPayment() {
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

async function doUpgrade(plan) {
  openPayModal('upgrade', plan);
}

async function doPurchase(pack) {
  openPayModal('purchase', pack);
}

// ── Feature 1: Contact edit/delete ──

function editContactForm(contactId) {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const contact = (mineCache.contacts || []).find(c => c.id === contactId);
  if (!contact) return;
  const lev = contact.leverage || {};
  const nur = contact.nurture || {};
  const datesStr = (contact.important_dates || []).map(dt => `${dt.date}|${dt.label}`).join('\n');
  const memStr = (contact.memories || []).map(m => typeof m === 'string' ? m : (m.content || m.text || '')).join('\n');

  document.getElementById('detailBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <label style="font-size:.8em;color:var(--dim)">${d.edit_name}<input id="edt_name" value="${escapeHtml(contact.name||'')}" class="input-field"></label>
      <label style="font-size:.8em;color:var(--dim)">${zh ? '昵称（逗号分隔）' : 'Nicknames (comma separated)'}<input id="edt_aliases" value="${escapeHtml((contact.aliases||contact.alias||[]).join(', '))}" class="input-field" placeholder="${zh ? '老肖, 肖哥' : 'nick1, nick2'}"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_relation}<input id="edt_relation" value="${escapeHtml(contact.relation||contact.role||'')}" class="input-field"></label>
      <div style="display:flex;gap:8px">
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_company}<input id="edt_company" value="${escapeHtml(contact.company||'')}" class="input-field"></label>
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_title}<input id="edt_title" value="${escapeHtml(contact.title||'')}" class="input-field"></label>
      </div>
      <div style="display:flex;gap:8px">
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_phone}<input id="edt_phone" value="${escapeHtml(contact.phone||'')}" class="input-field" placeholder="13800138000"></label>
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_email}<input id="edt_email" value="${escapeHtml(contact.email||'')}" class="input-field" placeholder="name@example.com"></label>
      </div>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_nature}
        <select id="edt_nature" class="input-field">
          <option value="leverage" ${contact.nature==='leverage'?'selected':''}>${d.edit_nature_leverage}</option>
          <option value="nurture" ${contact.nature==='nurture'?'selected':''}>${d.edit_nature_nurture}</option>
          <option value="dual" ${contact.nature==='dual'?'selected':''}>${d.edit_nature_dual}</option>
        </select>
      </label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_tags}<input id="edt_tags" value="${escapeHtml((contact.tags||[]).join(', '))}" class="input-field" placeholder="tag1, tag2"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_goals}<input id="edt_goals" value="${escapeHtml((lev.goals||[]).join(', '))}" class="input-field" placeholder="事业, 资源"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_how}<input id="edt_how" value="${escapeHtml(lev.how||'')}" class="input-field"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_bond}<input id="edt_bond" value="${escapeHtml(nur.bond||'')}" class="input-field"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_dates}<textarea id="edt_dates" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:4px;min-height:50px" placeholder="11-29|生日&#10;03-15|纪念日">${escapeHtml(datesStr)}</textarea></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_memories}<textarea id="edt_memories" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:4px;min-height:60px" placeholder="不喝白酒只喝红酒&#10;儿子今年中考">${escapeHtml(memStr)}</textarea></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_notes}<textarea id="edt_notes" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:4px;min-height:40px">${escapeHtml(contact.notes||'')}</textarea></label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button onclick="saveContactEdit('${contactId}')" style="flex:1;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${d.save_contact}</button>
        <button onclick="openContactDetail('${contactId}')" class="btn-flex-item">${d.cancel_edit}</button>
      </div>
    </div>
  `;
}

async function saveContactEdit(contactId) {
  const d = I18N[currentLang];
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const tags = val('edt_tags').split(',').map(t => t.trim()).filter(Boolean);
  const aliases = val('edt_aliases').split(',').map(a => a.trim()).filter(Boolean);
  const goals = val('edt_goals').split(',').map(t => t.trim()).filter(Boolean);
  const dates = val('edt_dates').split('\n').map(line => { const [date, ...labelParts] = line.split('|'); return { date: (date||'').trim(), label: labelParts.join('|').trim() }; }).filter(dt => dt.date);
  const memories = val('edt_memories').split('\n').map(m => m.trim()).filter(Boolean);

  const body = {
    id: contactId,
    name: val('edt_name'),
    aliases,
    relation: val('edt_relation'),
    role: val('edt_relation'),
    company: val('edt_company'),
    title: val('edt_title'),
    phone: val('edt_phone'),
    email: val('edt_email'),
    nature: val('edt_nature'),
    tags, notes: val('edt_notes'),
    leverage: { goals, how: val('edt_how') },
    nurture: { bond: val('edt_bond') },
    important_dates: dates,
    memories,
  };
  try {
    await mineApi('/data/contacts', 'POST', body);
    // Refresh cache
    await refreshContactsCache();
    openContactDetail(contactId);
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

async function deleteContact(contactId) {
  const d = I18N[currentLang];
  if (!confirm(d.confirm_delete)) return;
  try {
    const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
    const resp = await fetch(`${CLOUD_URL}/data/contacts?id=${encodeURIComponent(contactId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    closeContactDetail();
    await refreshContactsCache();
    if (mineCurrentTab === 'contacts') loadContactsTab();
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

async function refreshContactsCache() {
  try {
    const data = await mineApi('/data/contacts');
    mineCache.contacts = data.contacts || [];
  } catch (e) {}
}

// ── Feature 2: Export & delete account ──

async function loadSettingsTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  content.innerHTML = `
    <div class="mine-card">
      <div class="mine-card-title">🤖 ${zh ? '模型选择' : 'Model Tier'}</div>
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '选择 AI 模型等级，影响回复质量和消耗' : 'Choose AI model tier, affects quality and cost'}</div>
      <div id="modelTierBar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div id="costPreview"></div>
        <div style="display:flex;gap:6px">
          <button type="button" class="tier-btn" data-tier="standard" onclick="setModelTier('standard')">${zh ? '标准' : 'Standard'} ×1</button>
          <button type="button" class="tier-btn" data-tier="enhanced" onclick="setModelTier('enhanced')">${zh ? '增强' : 'Enhanced'} ×3</button>
          <button type="button" class="tier-btn" data-tier="premium" onclick="setModelTier('premium')">${zh ? '最强' : 'Premium'} ×10</button>
        </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('profileSection','profileToggle')">
        <span>👤 ${zh ? '个人画像' : 'My Profile'}</span>
        <span id="profileToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="profileSection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '填写后 AI 会据此调整拟消息语气、建议联系人的方向' : 'AI uses this to tailor message drafts and contact suggestions'}</div>
      <div id="profileForm" style="display:flex;flex-direction:column;gap:10px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('memorySection','memoryToggle')">
        <span>🧠 ${zh ? '我的记忆' : 'My Memories'}</span>
        <span id="memoryToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="memorySection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? 'AI 自动从对话中提取值得长期记住的信息，下次对话会自动参考' : 'AI auto-extracts memorable info from conversations, recalls it in future chats'}</div>
      <div id="memoryList" style="display:flex;flex-direction:column;gap:8px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div class="section-divider">
        <div class="label-muted">${zh ? '手动添加记忆' : 'Add memory manually'}</div>
        <input id="memTitle" placeholder="${zh ? '标题（如：老许的偏好）' : 'Title'}" class="input-field-lg">
        <textarea id="memContent" placeholder="${zh ? '内容（如：老许不喜欢周末被打扰）' : 'Content'}" rows="2" class="textarea-field"></textarea>
        <select id="memType" class="input-field-lg">
          <option value="preference">${zh ? '偏好' : 'Preference'}</option>
          <option value="context">${zh ? '背景' : 'Context'}</option>
          <option value="milestone">${zh ? '里程碑' : 'Milestone'}</option>
          <option value="contact_note">${zh ? '联系人备注' : 'Contact Note'}</option>
        </select>
        <button onclick="addMemoryManual()" class="btn-primary">${zh ? '添加' : 'Add'}</button>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('goalSection','goalToggle')">
        <span>🎯 ${zh ? '关系目标' : 'Relationship Goals'}</span>
        <span id="goalToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="goalSection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '设定关系经营目标，AI 自动从对话中匹配证据，全部标准满足后自动标记完成' : 'Set relationship goals. AI auto-links evidence from chats and completes goals when all criteria met.'}</div>
      <div id="goalList" style="display:flex;flex-direction:column;gap:8px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div class="section-divider">
        <div class="label-muted">${zh ? '新建目标' : 'New goal'}</div>
        <input id="goalTitle" placeholder="${zh ? '目标标题（如：本月重新联系3个大学同学）' : 'Goal title'}" class="input-field-lg">
        <div class="label-muted-sm">${zh ? '验收标准（每行一个）' : 'Acceptance criteria (one per line)'}</div>
        <textarea id="goalCriteria" placeholder="${zh ? '联系老许\\n联系小王\\n联系老张' : 'Contact X\\nContact Y\\nContact Z'}" rows="3" class="textarea-field"></textarea>
        <button onclick="addGoalManual()" class="btn-primary">${zh ? '创建目标' : 'Create goal'}</button>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('skillSection','skillToggle')">
        <span>🧩 ${zh ? '我的技能' : 'Custom Skills'}</span>
        <span id="skillToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="skillSection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '创建自定义技能，AI 在匹配到对应意图时自动加载。多次低评分后自动标记"需复查"。' : 'Create custom skills that AI auto-loads on matching intents. Low-rated skills auto-flag for review.'}</div>
      <div id="skillList" style="display:flex;flex-direction:column;gap:8px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div class="section-divider">
        <div class="label-muted">${zh ? '新建技能' : 'New skill'}</div>
        <input id="skillName" placeholder="${zh ? '技能名称（如：我的破冰方法论）' : 'Skill name'}" class="input-field-lg">
        <div class="label-muted-sm">${zh ? '触发意图（逗号分隔：greeting,congratulate,ask_for_help）' : 'Triggers (comma-separated)'}'}</div>
        <input id="skillTriggers" placeholder="greeting,congratulate,ask_for_help" class="input-field-lg">
        <div class="label-muted-sm">${zh ? '技能内容（AI 会读这段话作为指导）' : 'Skill content (AI reads this as guidance)'}</div>
        <textarea id="skillContent" placeholder="${zh ? '破冰时先找共同点，不要直接说目的…' : 'When breaking ice, find common ground first…'}" rows="4" class="textarea-field"></textarea>
        <button onclick="addCustomSkill()" class="btn-primary">${zh ? '创建技能' : 'Create skill'}</button>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title">📤 ${d.export_data}</div>
      <div class="mine-contact-sub" style="margin-bottom:12px">${d.export_desc}</div>
      <button onclick="exportMyData()" style="width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${d.export_data}</button>
    </div>
    <div class="mine-card">
      <div class="mine-card-title">📅 ${zh ? '日历同步' : 'Calendar Sync'}</div>
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '将待办和重要日期同步到日历应用，自动定期拉取更新。' : 'Sync todos and important dates to your calendar app, auto-refreshes periodically.'}</div>
      <div id="calendarFeedUrl" style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div id="calendarSyncResult" style="text-align:center;font-size:.8em;margin-top:8px"></div>
    </div>
    <div class="mine-card" style="border-color:rgba(201,100,66,.3)">
      <div class="mine-card-title" style="color:var(--accent)">⚠️ ${d.delete_account}</div>
      <div class="mine-contact-sub" style="margin-bottom:12px">${d.delete_account_desc}</div>
      <button onclick="deleteMyAccount()" style="width:100%;padding:10px;background:none;border:1px solid var(--accent);color:var(--accent);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${d.delete_account}</button>
    </div>
  `;
  // Restore saved tier selection
  showModelTierBar();
  // Load calendar feed URL
  loadCalendarFeedUrl();
}

async function loadCalendarFeedUrl() {
  const zh = currentLang === 'zh';
  const container = document.getElementById('calendarFeedUrl');
  if (!container) return;
  try {
    const token = await getClerkToken();
    if (!token) {
      container.innerHTML = `<span style="font-size:.8em;color:var(--dimmer)">${zh ? '请先登录' : 'Sign in first'}</span>`;
      return;
    }
    const resp = await fetch(`${CLOUD_URL}/data/calendar/token`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok || !data.feed_url) throw new Error(data.error || 'Failed');
    const url = data.feed_url;
    container.innerHTML = `
      <input type="text" readonly value="${url}" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:.78em;background:var(--surface);color:var(--text);font-family:monospace;overflow:hidden;text-overflow:ellipsis" id="calendarFeedInput">
      <button onclick="copyCalendarFeedUrl()" style="padding:8px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.82em;white-space:nowrap">${zh ? '复制' : 'Copy'}</button>
    `;
  } catch (e) {
    container.innerHTML = `<span style="font-size:.8em;color:var(--dimmer)">${zh ? '获取失败' : 'Failed'}: ${e.message}</span>`;
  }
}

function copyCalendarFeedUrl() {
  const input = document.getElementById('calendarFeedInput');
  if (!input) return;
  const zh = currentLang === 'zh';
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const result = document.getElementById('calendarSyncResult');
    if (result) result.innerHTML = `<span style="color:var(--accent)">✓ ${zh ? '已复制，去华为日历粘贴' : 'Copied! Paste in your calendar app'}</span>`;
  }).catch(() => {
    document.execCommand('copy');
    const result = document.getElementById('calendarSyncResult');
    if (result) result.innerHTML = `<span style="color:var(--accent)">✓ ${zh ? '已复制' : 'Copied'}</span>`;
  });
}

function toggleSection(sectionId, toggleId) {
  const sec = document.getElementById(sectionId);
  const toggle = document.getElementById(toggleId);
  if (!sec) return;
  const expanded = sec.style.display !== 'none';
  sec.style.display = expanded ? 'none' : 'block';
  if (toggle) toggle.textContent = expanded ? '▸' : '▾';
  if (!expanded) {
    if (sectionId === 'memorySection') loadMemoryList();
    else if (sectionId === 'profileSection') loadProfileForm();
    else if (sectionId === 'goalSection') loadGoalList();
    else if (sectionId === 'skillSection') loadCustomSkillList();
  }
}

async function loadMemoryList() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('memoryList');
  if (!el) return;
  try {
    const resp = await mineApi('/data/memory?limit=20');
    const memories = resp.memories || [];
    if (memories.length === 0) {
      el.innerHTML = `<div class="mine-empty">${zh ? '还没有记忆。对话中说"我一般不在周末联系客户"之类的话，AI 会自动记住。' : 'No memories yet. AI auto-learns from conversations.'}</div>`;
      return;
    }
    el.innerHTML = memories.map(m => `
      <div class="card-item">
        <div class="flex-between-start">
          <div style="flex:1">
            <div style="font-weight:500;font-size:.9em">${escapeHtml(m.title)}</div>
            <div style="font-size:.8em;color:var(--muted);margin-top:4px">${escapeHtml(m.content)}</div>
            <div style="font-size:.7em;color:var(--muted);margin-top:4px">
              <span style="background:var(--border);padding:1px 6px;border-radius:4px">${m.type}</span>
              ${m.tags && m.tags.length > 0 ? ' · ' + m.tags.map(escapeHtml).join(', ') : ''}
              · ${m.timestamp ? m.timestamp.slice(0, 10) : ''}
            </div>
          </div>
          <button onclick="deleteMemoryManual('${m.id}')" class="btn-icon-danger">×</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

async function addMemoryManual() {
  const zh = currentLang === 'zh';
  const title = document.getElementById('memTitle').value.trim();
  const content = document.getElementById('memContent').value.trim();
  const type = document.getElementById('memType').value;
  if (!title || !content) {
    alert(zh ? '请填写标题和内容' : 'Title and content required');
    return;
  }
  try {
    await mineApi('/data/memory', 'POST', { action: 'save', type, title, content });
    document.getElementById('memTitle').value = '';
    document.getElementById('memContent').value = '';
    loadMemoryList();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteMemoryManual(id) {
  try {
    await mineApi('/data/memory', 'POST', { action: 'delete', id });
    loadMemoryList();
  } catch (e) {
    alert(e.message);
  }
}

// ── Relationship Goals (G1) ──

async function loadGoalList() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('goalList');
  if (!el) return;
  try {
    const resp = await mineApi('/data/goals');
    const goals = resp.goals || [];
    if (goals.length === 0) {
      el.innerHTML = `<div class="mine-empty">${zh ? '还没有目标。创建一个开始追踪进度吧！' : 'No goals yet. Create one to start tracking!'}</div>`;
      return;
    }
    el.innerHTML = goals.map(g => {
      const statusColors = { active: 'var(--accent)', completed: '#22c55e', abandoned: 'var(--muted)' };
      const statusLabels = { active: zh ? '进行中' : 'Active', completed: zh ? '已完成' : 'Done', abandoned: zh ? '已放弃' : 'Abandoned' };
      const sc = statusColors[g.status] || 'var(--muted)';
      const sl = statusLabels[g.status] || g.status;
      const criteriaHtml = (g.criteria || []).map(c => {
        const dot = c.status === 'satisfied' ? '✅' : '⬜';
        const evCount = (c.evidence || []).length;
        return `<div style="font-size:.8em;margin-top:4px;padding-left:8px">${dot} ${escapeHtml(c.text)}${evCount > 0 ? ` <span style="color:var(--muted)">(${evCount})</span>` : ''}</div>`;
      }).join('');
      return `
        <div class="card-item">
          <div class="flex-between-start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.9em">${escapeHtml(g.title)}</div>
              <div style="font-size:.7em;margin-top:2px"><span style="background:${sc};color:#fff;padding:1px 6px;border-radius:4px">${sl}</span> · ${g.created_at ? g.created_at.slice(0,10) : ''}</div>
              ${criteriaHtml}
            </div>
            <div style="display:flex;gap:4px">
              ${g.status === 'active' ? `<button onclick="completeGoal('${g.id}')" title="${zh?'标记完成':'Complete'}" style="background:none;border:none;cursor:pointer;font-size:1.1em;padding:0 4px">✓</button>` : ''}
              <button onclick="deleteGoal('${g.id}')" title="${zh?'删除':'Delete'}" class="btn-icon-danger">×</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

// H2: Custom Skills CRUD
async function loadCustomSkillList() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('skillList');
  if (!el) return;
  try {
    const resp = await mineApi('/data/skills');
    const skills = resp.skills || [];
    if (skills.length === 0) {
      el.innerHTML = `<div class="mine-empty">${zh ? '还没有自定义技能。' : 'No custom skills yet.'}</div>`;
      return;
    }
    el.innerHTML = skills.map(s => {
      const statusLabel = s.status === 'monitoring' ? `<span style="color:#e74c3c;font-size:.7em">⚠️ ${zh?'需复查':'Review'}</span>` : '';
      const scoreStr = s.avg_score != null ? `★ ${s.avg_score.toFixed(1)}` : '';
      const useStr = s.usage_count > 0 ? `${s.usage_count} ${zh?'次':'uses'}` : '';
      return `
        <div class="card-item">
          <div class="flex-between-start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.9em">${escapeHtml(s.name)} ${statusLabel}</div>
              <div style="font-size:.75em;color:var(--muted);margin-top:2px">${(s.triggers||[]).join(', ')}</div>
              <div style="font-size:.75em;color:var(--muted);margin-top:2px">${useStr} ${scoreStr}</div>
              <div style="font-size:.8em;margin-top:4px;color:var(--dim);max-height:60px;overflow:hidden">${escapeHtml((s.content||'').slice(0,120))}${(s.content||'').length>120?'…':''}</div>
            </div>
            <button onclick="deleteCustomSkill('${s.id}')" title="${zh?'删除':'Delete'}" class="btn-icon-danger">×</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

async function addCustomSkill() {
  const zh = currentLang === 'zh';
  const name = document.getElementById('skillName').value.trim();
  const triggers = document.getElementById('skillTriggers').value.split(',').map(t => t.trim()).filter(Boolean);
  const content = document.getElementById('skillContent').value.trim();
  if (!name || !content) { alert(zh ? '请填写名称和内容' : 'Name and content required'); return; }
  try {
    await mineApi('/data/skills', { action: 'create', name, triggers, content });
    document.getElementById('skillName').value = '';
    document.getElementById('skillTriggers').value = '';
    document.getElementById('skillContent').value = '';
    loadCustomSkillList();
  } catch (e) { alert(e.message); }
}

async function deleteCustomSkill(skillId) {
  try {
    await mineApi('/data/skills', { action: 'delete', skill_id: skillId });
    loadCustomSkillList();
  } catch (e) { alert(e.message); }
}

async function addGoalManual() {
  const title = document.getElementById('goalTitle').value.trim();
  const criteriaText = document.getElementById('goalCriteria').value.trim();
  if (!title) { alert(currentLang === 'zh' ? '请输入目标标题' : 'Title required'); return; }
  const criteria = criteriaText.split('\n').map(s => s.trim()).filter(s => s);
  if (criteria.length === 0) { alert(currentLang === 'zh' ? '至少输入一个验收标准' : 'At least one criterion required'); return; }
  try {
    await mineApi('/data/goals', 'POST', { action: 'create', title, criteria });
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalCriteria').value = '';
    loadGoalList();
  } catch (e) {
    alert(e.message);
  }
}

async function completeGoal(id) {
  try {
    await mineApi('/data/goals', 'POST', { action: 'update_status', goal_id: id, status: 'completed' });
    loadGoalList();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteGoal(id) {
  try {
    await mineApi('/data/goals', 'POST', { action: 'delete', id });
    loadGoalList();
  } catch (e) {
    alert(e.message);
  }
}

function escapeHtml(s) {
  if (s === null || s === undefined || s === '') return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadProfileForm() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('profileForm');
  if (!el) return;
  let p = null;
  try {
    const resp = await mineApi('/data/profile');
    p = resp.profile || {};
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
    return;
  }
  const fields = [
    { key: 'name', label: zh ? '姓名' : 'Name', ph: '' },
    { key: 'occupation', label: zh ? '职业' : 'Occupation', ph: zh ? '如：产品经理' : 'e.g. Product Manager' },
    { key: 'company', label: zh ? '公司' : 'Company', ph: '' },
    { key: 'industry', label: zh ? '行业' : 'Industry', ph: zh ? '如：金融/科技' : 'e.g. Finance/Tech' },
    { key: 'location', label: zh ? '所在地' : 'Location', ph: zh ? '如：上海' : 'e.g. Shanghai' },
    { key: 'communication_style', label: zh ? '沟通风格' : 'Communication Style', ph: zh ? '如：正式/轻松/混合' : 'e.g. Formal/Casual' },
    { key: 'address_habit', label: zh ? '称呼习惯' : 'Address Habit', ph: zh ? '如：老X、X总、X哥' : 'e.g. Old X, Mr. X' },
    { key: 'focus_areas', label: zh ? '关注领域' : 'Focus Areas', ph: zh ? '如：量化投资、AI' : 'e.g. Quant, AI' },
    { key: 'message_tone', label: zh ? '拟消息语气' : 'Message Tone', ph: zh ? '如：简洁直接、不卑不亢' : 'e.g. Concise, confident' },
    { key: 'career_goal', label: zh ? '当前职业目标' : 'Career Goal', ph: '' },
    { key: 'current_projects', label: zh ? '正在推进的事' : 'Current Projects', ph: '' },
    { key: 'network_direction', label: zh ? '人脉方向' : 'Network Direction', ph: zh ? '如：拓展量化圈、对接银行科技' : 'e.g. Quant circle, bank tech' },
  ];
  let html = '';
  // Group: basics
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:4px">${zh ? '基础信息' : 'Basics'}</div>`;
  fields.slice(0, 5).forEach(f => {
    html += profileFieldInput(f, p);
  });
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:8px">${zh ? '关系偏好' : 'Preferences'}</div>`;
  fields.slice(5, 9).forEach(f => {
    html += profileFieldInput(f, p);
  });
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:8px">${zh ? '目标方向' : 'Goals'}</div>`;
  fields.slice(9).forEach(f => {
    html += profileFieldInput(f, p);
  });
  // Notes — large textarea
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:8px">${zh ? '附注' : 'Notes'}</div>`;
  html += `<textarea id="profile_notes" placeholder="${zh ? '可以贴一大段文字，比如个人简介、背景资料、备忘等' : 'Paste longer text here — bio, background, notes, etc.'}" style="width:100%;min-height:120px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;resize:vertical;margin-top:2px">${escapeHtml(p.notes || '')}</textarea>`;
  html += `<button onclick="saveProfile()" id="profileSaveBtn" style="margin-top:8px;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${zh ? '保存画像' : 'Save Profile'}</button>`;
  html += `<div id="profileSaveResult" style="text-align:center;font-size:.8em;margin-top:6px"></div>`;
  el.innerHTML = html;
}

function profileFieldInput(f, p) {
  return `<div>
    <label style="font-size:.78em;color:var(--dim)">${f.label}</label>
    <input id="profile_${f.key}" type="text" value="${escapeHtml(p[f.key] || '')}" placeholder="${escapeHtml(f.ph)}" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:2px">
  </div>`;
}

async function saveProfile() {
  const zh = currentLang === 'zh';
  const btn = document.getElementById('profileSaveBtn');
  const result = document.getElementById('profileSaveResult');
  if (btn) btn.disabled = true;
  if (result) result.innerHTML = zh ? '保存中…' : 'Saving…';
  const keys = ['name','occupation','company','industry','location','communication_style','address_habit','focus_areas','message_tone','career_goal','current_projects','network_direction'];
  const body = {};
  keys.forEach(k => {
    const el = document.getElementById('profile_' + k);
    if (el) body[k] = el.value.trim();
  });
  // Notes from textarea
  const notesEl = document.getElementById('profile_notes');
  if (notesEl) body.notes = notesEl.value.trim();
  try {
    await mineApi('/data/profile', 'POST', body);
    // Invalidate cache so next chat picks up new profile
cachedUserProfile = '';
    cachedUserProfileObj = null;
    if (result) result.innerHTML = `<span style="color:var(--accent)">✓ ${zh ? '已保存' : 'Saved'}</span>`;
  } catch (e) {
    if (result) result.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
  if (btn) btn.disabled = false;
}

async function syncContactsToCloud() {
  const zh = currentLang === 'zh';
  const btn = document.getElementById('syncContactsBtn');
  const resultEl = document.getElementById('syncContactsResult');
  if (btn) btn.disabled = true;
  if (resultEl) resultEl.innerHTML = zh ? '正在合并去重云端联系人…' : 'Deduplicating cloud contacts…';
  try {
    const token = await getClerkToken();
    const resp = await fetch(`${CLOUD_URL}/data/contacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      const msg = zh
        ? `✓ 完成：${data.total} 条联系人，移除 ${data.removed} 条重复`
        : `✓ Done: ${data.total} contacts, removed ${data.removed} duplicates`;
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent)">${msg}</span>`;
    } else {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${data.error || 'failed'}</span>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
  if (btn) btn.disabled = false;
}

async function exportMyData() {
  const d = I18N[currentLang];
  try {
    const [contacts, todos, timeline] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    const exportData = {
      exported_at: new Date().toISOString(),
      app: 'Welian',
      version: '1.0',
      contacts: contacts.contacts || [],
      todos: todos.todos || [],
      timeline: timeline.timeline || [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welian-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert(d.export_done);
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

async function deleteMyAccount() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  // Step 1: confirm data exported
  if (!confirm(zh
    ? '⚠️ 注销前确认\n\n你的联系人、互动记录、待办等数据已导出备份了吗？\n\n注销后所有数据将被永久删除，无法恢复。'
    : '⚠️ Before deleting\n\nHave you exported your data (contacts, timeline, todos)?\n\nAll data will be permanently deleted and cannot be recovered.'
  )) return;
  // Step 2: final confirm
  if (!confirm(d.confirm_delete_account)) return;
  // Step 3: type to confirm
  const keyword = zh ? '删除' : 'DELETE';
  const input = prompt(zh
    ? `⚠️ 最后确认\n\n这是不可逆操作，所有数据将被永久删除。\n\n请输入 "${keyword}" 确认：`
    : `⚠️ Final warning\n\nThis is irreversible. All data will be permanently deleted.\n\nType "${keyword}" to confirm:`
  );
  if (input !== keyword) {
    if (input !== null) alert(zh ? '输入不匹配，已取消注销' : 'Input mismatch, cancellation aborted');
    return;
  }
  const token = await getClerkToken();
  if (!token) return;
  try {
    // Delete all cloud data + Clerk account (backend handles Clerk deletion via Secret Key)
    const resp = await fetch(`${CLOUD_URL}/data/delete_account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, confirm: true }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const result = await resp.json().catch(() => ({}));
    // Sign out locally (Clerk account already deleted on backend)
    if (clerkInstance) {
      try { clerkInstance.signOut(); } catch(e) {}
    }
    onSignedOut();
    if (result.clerk_deleted === false) {
      alert(zh ? '⚠️ 数据已删除，但 Clerk 账号删除失败，请手动退出登录。' : '⚠️ Data deleted, but Clerk account deletion failed. Please sign out manually.');
    } else {
      alert(d.delete_done);
    }
    location.reload();
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

// ── HN Signals tab: Always-on Hacker News briefing, personalized ──

async function loadSignalsTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    const resp = await mineApi('/ai/hn_signals', 'POST', {});
    const report = resp.report || {};
    const raw = resp.raw_data || {};
    const signals = report.signals || [];
    const themes = report.themes || [];

    let html = `<div class="mine-card" style="text-align:center;margin-bottom:12px">
      <div style="font-size:1.2em;font-weight:500">📡 ${zh ? '今日 HN 信号' : 'Today\'s HN Signals'}</div>
      <div style="font-size:.78em;color:var(--dim);margin-top:4px">${zh ? '结合你的关系网络，从 Hacker News 筛选关键信号' : 'Personalized from Hacker News with your network context'}</div>
      <div style="margin-top:8px;display:flex;gap:8px"><button onclick="shareSignalsReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${zh ? '📤 分享' : '📤 Share'}</button><button onclick="exportReportPDF('signals', window._signalsReportData?.report || {})" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">📄 PDF</button></div>
    </div>`;

    if (report.greeting) {
      html += `<div class="mine-card" style="font-size:.9em;line-height:1.7">${escapeHtml(report.greeting)}</div>`;
    }

    if (themes.length > 0) {
      html += `<div class="mine-section-title">${zh ? '🔥 热点主题' : '🔥 Hot Themes'}</div><div class="mine-card">`;
      themes.forEach(t => { html += `<span style="display:inline-block;background:var(--accent);color:#fff;padding:2px 10px;border-radius:12px;font-size:.78em;margin:2px">${escapeHtml(t)}</span>`; });
      html += `</div>`;
    }

    if (signals.length > 0) {
      html += `<div class="mine-section-title">${zh ? '📊 关键信号' : '📊 Key Signals'}</div>`;
      signals.forEach((s, i) => {
        html += `<div class="mine-card">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.92em">${escapeHtml(s.title || '')}</div>
              <div style="font-size:.72em;color:var(--dimmer);margin-top:2px">${s.points || 0} ${zh?'分':'pts'} · <a href="${escapeHtml(s.hn_url || '')}" target="_blank" style="color:var(--accent)">HN</a>${s.url ? ` · <a href="${escapeHtml(s.url)}" target="_blank" style="color:var(--accent)">${zh?'原文':'Source'}</a>` : ''}</div>
            </div>
          </div>
          <div style="font-size:.82em;line-height:1.6;margin-top:8px;color:var(--dim)"><strong>${zh?'为什么重要':'Why'}：</strong>${escapeHtml(s.why || '')}</div>
          <div style="font-size:.82em;line-height:1.6;margin-top:4px;color:var(--accent)"><strong>→ ${zh?'建议行动':'Action'}：</strong>${escapeHtml(s.action || '')}</div>
          ${(s.tags || []).length > 0 ? `<div style="margin-top:6px">${s.tags.map(t => `<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:8px;font-size:.7em;margin:1px">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`;
      });
    } else {
      html += `<div class="mine-empty">${zh ? '今天没有强相关信号' : 'No strong signals today'}</div>`;
    }

    if (report.closing) {
      html += `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>`;
    }

    content.innerHTML = html;
    window._signalsReportData = { report, raw };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

function shareSignalsReport() {
  const data = window._signalsReportData;
  if (!data) return;
  const { report } = data;
  const zh = currentLang === 'zh';
  let text = `📡 ${zh ? '今日 HN 信号' : "Today's HN Signals"}\n\n`;
  if (report.greeting) text += `${report.greeting}\n\n`;
  if ((report.themes || []).length > 0) {
    text += zh ? `🔥 热点主题\n${report.themes.map(t => `· ${t}`).join('\n')}\n\n` : `🔥 Themes\n${report.themes.map(t => `· ${t}`).join('\n')}\n\n`;
  }
  const signals = report.signals || [];
  if (signals.length > 0) {
    signals.forEach(s => {
      text += `📊 ${s.title || ''} (${s.points || 0}pts)\n`;
      text += `${zh ? '为什么重要' : 'Why'}：${s.why || ''}\n`;
      text += `→ ${zh ? '建议' : 'Action'}：${s.action || ''}\n`;
      if (s.hn_url) text += `${s.hn_url}\n`;
      text += `\n`;
    });
  }
  if (report.closing) text += `${report.closing}\n`;
  text += `\n— Welian 小维 · welian.app`;

  const sections = [];
  if (report.greeting) sections.push({ icon: '💬', title: '', items: [escapeHtml(report.greeting)] });
  if ((report.themes || []).length > 0) {
    sections.push({ icon: '🔥', title: zh ? '热点主题' : 'Themes', items: report.themes.map(t => escapeHtml(t)) });
  }
  if (signals.length > 0) {
    sections.push({ icon: '📊', title: zh ? '关键信号' : 'Key Signals', items: signals.map(s => `${escapeHtml(s.title||'')} (${s.points||0}pts)\n${escapeHtml(s.why||'')}\n→ ${escapeHtml(s.action||'')}`) });
  }
  const card = buildShareCard(zh ? '📡 今日 HN 信号' : '📡 HN Signals', zh ? '结合你的关系网络' : 'Personalized with your network', sections, zh);
  showShareModal(text, zh, card);
}

// ── Feature 3: Monthly dashboard ──

async function loadMonthlyTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    // Use structured monthly_report endpoint + local data for dashboard
    const [reportRes, contactsRes, todosRes, timelineRes] = await Promise.all([
      mineApi('/ai/monthly_report', 'POST', {}).catch(() => null),
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    const report = (reportRes && reportRes.report) || {};
    const contacts = contactsRes.contacts || [];
    const todos = todosRes.todos || [];
    const timeline = timelineRes.timeline || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Categorize contacts by nature (infer from relation if nature missing)
    const inferNature = (c) => {
      if (c.nature) return c.nature;
      const rel = (c.relation || '') + (c.sub_relation || '');
      if (/家|父|母|爸|妈|妻|夫|子|女|爷|奶|兄|弟|姐|妹|family|parent|spouse|child/i.test(rel)) return 'nurture';
      if (/同行|校友|客户|合作|同事|同学|partner|colleague|client/i.test(rel)) return 'leverage';
      return 'nurture'; // default to nurture (conservative)
    };
    const contactNature = c => inferNature(c);
    const nurtureContacts = contacts.filter(c => { const n = contactNature(c); return n === 'nurture' || n === 'dual'; });
    const leverageContacts = contacts.filter(c => { const n = contactNature(c); return n === 'leverage' || n === 'dual'; });

    // This month's timeline
    const monthTimeline = timeline.filter(t => new Date(t.date || 0) >= monthStart);
    const lastMonthTimeline = timeline.filter(t => { const d = new Date(t.date || 0); return d >= lastMonthStart && d < monthStart; });
    const monthTodosDone = todos.filter(t => t.done && t.done_at && new Date(t.done_at) >= monthStart);

    // 做到率（合作者维度）
    const monthTodos = todos.filter(t => {
      const d = t.created_at || t.date || 0;
      return new Date(d) >= lastMonthStart; // 本月+上月创建的待办
    });
    const doneRate = monthTodos.length > 0 ? Math.round(monthTodos.filter(t => t.done).length / monthTodos.length * 100) : 0;

    // 重新联系（隔 >90 天再次互动）
    const reconnects = [];
    monthTimeline.forEach(t => {
      const cid = t.contact;
      if (!cid) return;
      const allForContact = timeline.filter(x => x.contact === cid).sort((a,b) => new Date(a.date||0) - new Date(b.date||0));
      const idx = allForContact.findIndex(x => x === t || x.id === t.id);
      if (idx > 0) {
        const prev = allForContact[idx - 1];
        const gap = (new Date(t.date || 0) - new Date(prev.date || 0)) / 86400000;
        if (gap > 90) {
          const c = contacts.find(c => c.id === cid || c.name === cid);
          if (c && !reconnects.find(r => r.name === c.name)) {
            reconnects.push({ name: c.name, gap: Math.round(gap), nature: c.nature });
          }
        }
      }
    });

    // 趋势对比
    const trendArrow = monthTimeline.length > lastMonthTimeline.length ? '↑' : (monthTimeline.length < lastMonthTimeline.length ? '↓' : '→');
    const trendDiff = monthTimeline.length - lastMonthTimeline.length;

    // Group by role (using inferred nature)
    const friendInteractions = monthTimeline.filter(t => {
      const c = contacts.find(c => c.id === t.contact);
      if (!c) return false;
      const n = contactNature(c);
      return n === 'nurture' || n === 'dual';
    });
    const familyInteractions = monthTimeline.filter(t => {
      const c = contacts.find(c => c.id === t.contact);
      if (!c) return false;
      const n = contactNature(c);
      return n === 'nurture' && /父|母|爸|妈|妻|夫|子|女|家|爷|奶|兄|弟|姐|妹|family|parent|spouse|child/i.test((c.relation || '') + (c.sub_relation || ''));
    });
    const collaboratorInteractions = monthTimeline.filter(t => {
      const c = contacts.find(c => c.id === t.contact);
      if (!c) return false;
      const n = contactNature(c);
      return n === 'leverage' || n === 'dual';
    });

    // Upcoming important dates this month
    const upcomingDates = [];
    contacts.forEach(c => {
      (c.important_dates || []).forEach(dt => {
        if (dt.date) {
          const m = dt.date.match(/(\d{2})-(\d{2})/);
          if (m && parseInt(m[1]) === now.getMonth() + 1) {
            const day = parseInt(m[2]);
            if (day >= now.getDate()) {
              upcomingDates.push({ name: c.name, date: dt.date, label: dt.label, days: day - now.getDate() });
            }
          }
        }
      });
    });
    upcomingDates.sort((a, b) => a.days - b.days);

    const monthName = now.toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long' });
    const hasData = monthTimeline.length > 0 || monthTodosDone.length > 0;

    // AI insights from structured report
    let aiInsightHtml = '';
    if (report.greeting) {
      aiInsightHtml += `<div class="mine-card" style="font-size:.9em;line-height:1.7;margin-bottom:12px">${escapeHtml(report.greeting)}</div>`;
    }
    if (report.achievements && report.achievements.length > 0) {
      aiInsightHtml += `<div class="mine-section-title">✨ ${currentLang==='zh'?'本月亮点':'Highlights'}</div><div class="mine-card">`;
      report.achievements.forEach(a => { aiInsightHtml += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(a)}</div></div>`; });
      aiInsightHtml += `</div>`;
    }
    if (report.suggestions && report.suggestions.length > 0) {
      aiInsightHtml += `<div class="mine-section-title">💡 ${currentLang==='zh'?'下月建议':'Suggestions'}</div><div class="mine-card">`;
      report.suggestions.forEach(s => { aiInsightHtml += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(s)}</div></div>`; });
      aiInsightHtml += `</div>`;
    }

    content.innerHTML = `
      <div class="mine-card" style="text-align:center;margin-bottom:12px">
        <div style="font-size:1.2em;font-weight:500">${currentLang==='zh'?'📊 '+monthName+'的你':'📊 '+monthName}</div>
        <div style="font-size:.78em;color:var(--dim);margin-top:4px">${monthTimeline.length} ${currentLang==='zh'?'次互动':'interactions'} ${trendArrow} ${trendDiff>0?'+':''}${trendDiff} ${currentLang==='zh'?'vs 上月':'vs last month'}</div>
        <div style="margin-top:8px;display:flex;gap:8px"><button onclick="shareMonthlyReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${currentLang==='zh'?'📤 分享':'📤 Share'}</button><button onclick="exportMonthlyPDF()" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">📄 PDF</button></div>
      </div>
      ${aiInsightHtml}
      ${hasData ? `
        <div class="mine-section-title">🌱 ${d.monthly_friend}</div>
        <div class="mine-card">
          <div class="mine-contact-sub">${friendInteractions.length} ${d.monthly_interactions}</div>
          ${friendInteractions.slice(0,3).map(t => {
            const c = contacts.find(c => c.id === t.contact);
            return `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}</div></div>`;
          }).join('')}
          ${friendInteractions.length === 0 ? `<div class="mine-empty">${d.monthly_no_data}</div>` : ''}
        </div>
        <div class="mine-section-title">🏡 ${d.monthly_family}</div>
        <div class="mine-card">
          <div class="mine-contact-sub">${familyInteractions.length} ${d.monthly_interactions}</div>
          ${familyInteractions.slice(0,3).map(t => {
            const c = contacts.find(c => c.id === t.contact);
            return `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}</div></div>`;
          }).join('')}
          ${familyInteractions.length === 0 ? `<div class="mine-empty">${d.monthly_no_data}</div>` : ''}
        </div>
        <div class="mine-section-title">🤝 ${d.monthly_collaborator}</div>
        <div class="mine-card">
          <div class="mine-contact-sub">${collaboratorInteractions.length} ${d.monthly_interactions} · ${d.monthly_todos_done} ${monthTodosDone.length} · ${currentLang==='zh'?'做到率':'done rate'} ${doneRate}%</div>
          ${collaboratorInteractions.slice(0,3).map(t => {
            const c = contacts.find(c => c.id === t.contact);
            return `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}</div></div>`;
          }).join('')}
          ${collaboratorInteractions.length === 0 ? `<div class="mine-empty">${d.monthly_no_data}</div>` : ''}
        </div>
      ` : `<div class="mine-empty">${d.monthly_no_data}</div>`}
      ${reconnects.length > 0 ? `
        <div class="mine-section-title">🔄 ${currentLang==='zh'?'重新联系':'Reconnections'}</div>
        <div class="mine-card">
          ${reconnects.slice(0,5).map(r => `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(r.name)}</strong> — ${currentLang==='zh'?'隔了 '+r.gap+' 天再次联系':'reconnected after '+r.gap+' days'}</div></div>`).join('')}
        </div>
      ` : ''}
      ${upcomingDates.length > 0 ? `
        <div class="mine-section-title">📅 ${d.monthly_upcoming}</div>
        <div class="mine-card">
          ${upcomingDates.slice(0,5).map(u => `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(u.name)}</strong> — ${escapeHtml(u.label)} (${u.date})</div></div>`).join('')}
        </div>
      ` : ''}
      ${report.closing ? `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>` : ''}
    `;
    // Store report data for sharing
    window._monthlyReportData = { report, monthName, monthTimeline, friendInteractions, familyInteractions, collaboratorInteractions, contacts, doneRate, monthTodosDone, reconnects, upcomingDates, trendDiff, trendArrow };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

function exportMonthlyPDF() {
  const data = window._monthlyReportData;
  if (!data) return;
  const { report, monthName, monthTimeline, friendInteractions, familyInteractions, collaboratorInteractions, contacts, doneRate, reconnects } = data;
  // Build PDF-friendly structure
  const pdfReport = {
    greeting: report.greeting || `${monthName} 关系复盘`,
    overview: {
      total_interactions: monthTimeline.length,
      unique_contacts: new Set(monthTimeline.map(t => t.contact || t.name)).size,
      new_todos: (report.new_todos) || 0,
      summary: report.summary || '',
    },
    group_breakdown: [
      { label: '朋友', interactions: friendInteractions.length, contacts: new Set(friendInteractions.map(t => t.contact)).size },
      { label: '家人', interactions: familyInteractions.length, contacts: new Set(familyInteractions.map(t => t.contact)).size },
      { label: '合作者', interactions: collaboratorInteractions.length, contacts: new Set(collaboratorInteractions.map(t => t.contact)).size },
    ].filter(g => g.interactions > 0),
    key_contacts: (report.key_contacts || []).slice(0, 10),
    patterns: report.patterns || [],
    suggestions: report.suggestions || [],
    closing: report.closing || '',
  };
  exportReportPDF('monthly', pdfReport);
}

function shareMonthlyReport() {
  const data = window._monthlyReportData;
  if (!data) return;
  const { report, monthName, monthTimeline, friendInteractions, familyInteractions, collaboratorInteractions, contacts, doneRate, monthTodosDone, reconnects, upcomingDates, trendDiff, trendArrow } = data;
  const zh = currentLang === 'zh';
  let text = `📊 ${zh ? monthName + '的你' : monthName}\n${monthTimeline.length} ${zh?'次互动':'interactions'} ${trendArrow} ${trendDiff>0?'+':''}${trendDiff} ${zh?'vs 上月':'vs last month'}\n\n`;
  if (report.greeting) text += `${report.greeting}\n\n`;
  if (report.achievements && report.achievements.length > 0) {
    text += zh ? `✨ 本月亮点\n` : `✨ Highlights\n`;
    report.achievements.forEach(a => { text += `· ${a}\n`; });
    text += '\n';
  }
  if (friendInteractions.length > 0) {
    text += zh ? `🌱 朋友 ${friendInteractions.length} 次互动\n` : `🌱 Friends ${friendInteractions.length} interactions\n`;
    friendInteractions.slice(0,3).forEach(t => {
      const c = contacts.find(c => c.id === t.contact);
      text += `· ${c?.name||''}：${(t.summary||t.action||'').substring(0,50)}\n`;
    });
    text += '\n';
  }
  if (collaboratorInteractions.length > 0) {
    text += zh ? `🤝 合作者 ${collaboratorInteractions.length} 次互动 · 完成 ${monthTodosDone.length} · 做到率 ${doneRate}%\n` : `🤝 Collaborators ${collaboratorInteractions.length} interactions · ${monthTodosDone.length} done · ${doneRate}%\n`;
    collaboratorInteractions.slice(0,3).forEach(t => {
      const c = contacts.find(c => c.id === t.contact);
      text += `· ${c?.name||''}：${(t.summary||t.action||'').substring(0,50)}\n`;
    });
    text += '\n';
  }
  if (reconnects.length > 0) {
    text += zh ? `🔄 重新联系\n` : `🔄 Reconnections\n`;
    reconnects.slice(0,5).forEach(r => { text += `· ${r.name} — ${zh?'隔了 '+r.gap+' 天':'after '+r.gap+' days'}\n`; });
    text += '\n';
  }
  if (upcomingDates.length > 0) {
    text += zh ? `📅 近期重要日期\n` : `📅 Upcoming dates\n`;
    upcomingDates.slice(0,5).forEach(u => { text += `· ${u.name} — ${u.label} (${u.date})\n`; });
    text += '\n';
  }
  if (report.suggestions && report.suggestions.length > 0) {
    text += zh ? `💡 下月建议\n` : `💡 Suggestions\n`;
    report.suggestions.forEach(s => { text += `· ${s}\n`; });
    text += '\n';
  }
  if (report.closing) text += `${report.closing}\n`;
  text += `\n— Welian 小维`;

  // Build share card
  const sections = [];
  if (report.greeting) sections.push({ icon: '💬', title: '', items: [escapeHtml(report.greeting)] });
  if (report.achievements && report.achievements.length > 0) {
    sections.push({ icon: '✨', title: zh ? '本月亮点' : 'Highlights', items: report.achievements.map(a => escapeHtml(a)) });
  }
  if (friendInteractions.length > 0) {
    sections.push({ icon: '🌱', title: zh ? `朋友 ${friendInteractions.length} 次互动` : `Friends ${friendInteractions.length} interactions`, items: friendInteractions.slice(0,3).map(t => { const c = contacts.find(c => c.id === t.contact); return `${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}`; }) });
  }
  if (collaboratorInteractions.length > 0) {
    sections.push({ icon: '🤝', title: zh ? `合作者 ${collaboratorInteractions.length} 次 · 完成 ${monthTodosDone.length} · 做到率 ${doneRate}%` : `Collaborators ${collaboratorInteractions.length} · ${monthTodosDone.length} done · ${doneRate}%`, items: collaboratorInteractions.slice(0,3).map(t => { const c = contacts.find(c => c.id === t.contact); return `${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}`; }) });
  }
  if (reconnects.length > 0) {
    sections.push({ icon: '🔄', title: zh ? '重新联系' : 'Reconnections', items: reconnects.slice(0,5).map(r => `${escapeHtml(r.name)} — ${zh?'隔了 '+r.gap+' 天':'after '+r.gap+' days'}`) });
  }
  if (upcomingDates.length > 0) {
    sections.push({ icon: '📅', title: zh ? '近期重要日期' : 'Upcoming dates', items: upcomingDates.slice(0,5).map(u => `${escapeHtml(u.name)} — ${escapeHtml(u.label)} (${u.date})`) });
  }
  if (report.suggestions && report.suggestions.length > 0) {
    sections.push({ icon: '💡', title: zh ? '下月建议' : 'Suggestions', items: report.suggestions.map(s => escapeHtml(s)) });
  }
  const subtitle = `${monthTimeline.length} ${zh?'次互动':'interactions'} ${trendArrow} ${trendDiff>0?'+':''}${trendDiff} ${zh?'vs 上月':'vs last month'}`;
  const card = buildShareCard(zh ? `📊 ${monthName}的你` : `📊 ${monthName}`, subtitle, sections, zh);
  showShareModal(text, zh, card);
}

// ── Feature 4: Cooldown warnings in contact list ──

function getCooldownInfo(contact, timeline) {
  if (contact.nature === 'nurture') return null; // No cooldown for nurture
  const contactTimeline = timeline.filter(t => t.contact === contact.id);
  if (contactTimeline.length === 0) return { days: 999, urgent: true };
  const latest = contactTimeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
  const days = Math.floor((Date.now() - new Date(latest.date || 0)) / 86400000);
  const threshold = contact.nature === 'dual' ? 21 : 14;
  return { days, urgent: days >= threshold, latest };
}

// ── Feature 5: Meeting prep ──

async function meetingPrepDetail(contactId) {
  const d = I18N[currentLang];
  const contact = (mineCache.contacts || []).find(c => c.id === contactId);
  if (!contact) return;
  const body = document.getElementById('detailBody');
  body.innerHTML = `<div class="mine-empty">${d.meeting_prep_loading}</div>`;
  try {
    const result = await mineApi('/ai/meeting_prep', 'POST', { contact_id: contactId });
    const data = result;
    let html = '';
    if (data.timeline && data.timeline.length > 0) {
      html += `<div class="mine-detail-section"><div class="mine-detail-section-title">${d.meeting_last}</div>`;
      data.timeline.forEach(t => {
        const dt = (t.date || '').substring(0, 10);
        html += `<div class="mine-detail-item">${dt} — ${escapeHtml(t.summary || t.action || '')}</div>`;
      });
      html += `</div>`;
    }
    if (data.todos && data.todos.length > 0) {
      html += `<div class="mine-detail-section"><div class="mine-detail-section-title">${d.meeting_todos}</div>`;
      data.todos.forEach(t => {
        html += `<div class="mine-detail-item">⬜ ${escapeHtml(t.task || '')}</div>`;
      });
      html += `</div>`;
    }
    if (data.prep) {
      html += `<div class="mine-detail-section"><div class="mine-detail-section-title">${d.meeting_tips}</div>`;
      html += `<div style="font-size:.88em;line-height:1.7;white-space:pre-wrap">${escapeHtml(data.prep)}</div>`;
      html += `</div>`;
    }
    if (data.usage) {
      html += `<div style="font-size:.7em;color:var(--dimmer);margin-top:8px">${d.cost_preview}: ${Math.round(data.usage.points * 10) / 10} ${d.cost_points} · ${d.billing_remaining}: ${Math.round(data.usage.remaining * 10) / 10}</div>`;
    }
    html += `<button onclick="openContactDetail('${contactId}')" style="margin-top:12px;width:100%;padding:8px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em;color:var(--dim)">${d.cancel_edit}</button>`;
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

async function meetingPrep(contactName) {
  const d = I18N[currentLang];
  const contact = (mineCache.contacts || []).find(c =>
    c.name === contactName || (c.aliases || []).includes(contactName) || (c.alias || []).includes(contactName)
  );
  if (!contact) {
    addMsg('ai', `我没有找到「${contactName}」的记录。你可以先聊聊再问我。`);
    return;
  }
  addMsg('ai', `⏳ ${d.meeting_prep_loading}`);
  try {
    const tlRes = await mineApi(`/data/timeline?contact_id=${encodeURIComponent(contact.id)}`);
    const todosRes = await mineApi('/data/todos');
    const contactTodos = (todosRes.todos || []).filter(t => t.contact === contact.id && !t.done);
    const timeline = (tlRes.timeline || []).slice(-5);

    let prep = `📋 **${d.meeting_prep_title}：${contact.name}**\n\n`;
    if (timeline.length > 0) {
      prep += `**${d.meeting_last}：**\n`;
      timeline.forEach(t => {
        const dt = (t.date || '').substring(0, 10);
        prep += `  · ${dt} ${t.summary || t.action || ''}\n`;
      });
    } else {
      prep += `**${d.meeting_last}：** 暂无记录\n`;
    }
    if (contactTodos.length > 0) {
      prep += `\n**${d.meeting_todos}：**\n`;
      contactTodos.forEach(t => prep += `  · ⬜ ${t.task || ''}\n`);
    }
    if (contact.nurture?.bond) prep += `\n**关系：** ${contact.nurture.bond}\n`;
    if (contact.memories?.length > 0) {
      prep += `\n**记得：**\n`;
      contact.memories.slice(0, 3).forEach(m => prep += `  · ${typeof m === 'string' ? m : (m.content || '')}\n`);
    }
    addMsg('ai', prep);
  } catch (e) {
    addMsg('ai', `${d.meeting_prep}失败：${e.message}`);
  }
}

// ── Feature 6: Model tier selection ──

let currentModelTier = localStorage.getItem('welian_model_tier') || 'standard';
const MODEL_TIERS = {
  standard: { multiplier: 1, label: { en: 'Standard', zh: '标准' } },
  enhanced: { multiplier: 3, label: { en: 'Enhanced', zh: '增强' } },
  premium:  { multiplier: 10, label: { en: 'Premium', zh: '最强' } },
};

function setModelTier(tier) {
  currentModelTier = tier;
  localStorage.setItem('welian_model_tier', tier);
  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tier === tier);
  });
  updateCostPreview();
}

async function updateCostPreview() {
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

function showModelTierBar() {
  const bar = document.getElementById('modelTierBar');
  if (bar) bar.style.display = 'flex';
  // Restore saved tier selection
  document.querySelectorAll('.tier-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tier === currentModelTier);
  });
  updateCostPreview();
}

// ── Feature 7: Rollover (backend handles, frontend just displays) ──

// ── Feature 8: Cost preview ──

function showCostPreview(estimatedPoints) {
  const d = I18N[currentLang];
  return `${d.cost_preview}: ~${estimatedPoints} ${d.cost_points}`;
}

// ── Timeline tab (interaction records management) ──

let timelineFilter = 'all'; // all | contact
let timelineSearchQuery = '';
let timelineCache = [];

async function loadTimelineTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    const [timelineRes, contactsRes] = await Promise.all([
      mineApi('/data/timeline'),
      mineApi('/data/contacts').catch(() => ({ contacts: [] })),
    ]);
    timelineCache = timelineRes.timeline || [];
    mineCache.contacts = contactsRes.contacts || [];
    renderTimelineTab();
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

function renderTimelineTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  const contacts = mineCache.contacts || [];
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);

  let html = '';

  // Search bar
  html += `<div style="margin-bottom:12px;display:flex;gap:8px">
    <input id="timelineSearch" type="text" value="${escapeHtml(timelineSearchQuery)}" placeholder="${zh?'搜索互动记录…':'Search interactions…'}" oninput="filterTimelineSearch(this.value)" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:.85em">
  </div>`;

  // Filter and sort
  let items = [...timelineCache];
  if (timelineSearchQuery) {
    const q = timelineSearchQuery.toLowerCase();
    items = items.filter(t => {
      const name = contactMap[t.contact]?.name || '';
      return (t.summary || '').toLowerCase().includes(q) ||
             (t.action || '').toLowerCase().includes(q) ||
             name.toLowerCase().includes(q);
    });
  }
  items.sort((a, b) => new Date((b.date || '1970-01-01').substring(0, 10)) - new Date((a.date || '1970-01-01').substring(0, 10)));

  if (items.length === 0) {
    html += `<div class="mine-empty">${zh?'暂无互动记录':'No interactions yet'}</div>`;
  } else {
    // Group by month
    const groups = {};
    items.forEach(t => {
      const dateStr = (t.date || '').substring(0, 7);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(t);
    });
    const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const todayStr = localDateStr();
    sortedMonths.forEach(month => {
      const monthDate = new Date(month + '-01');
      const monthLabel = zh
        ? `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`
        : monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      html += `<div class="mine-section-title" style="color:var(--dim)">${monthLabel} <span style="font-size:.75em;opacity:.6">(${groups[month].length})</span></div>`;
      html += `<div class="mine-card">`;
      groups[month].forEach(t => {
        const contactName = contactMap[t.contact]?.name || '';
        const date = (t.date || '').substring(0, 10);
        const dayStr = date.substring(5);
        const summary = t.summary || t.action || '';
        const isToday = date === todayStr;
        const tId = escapeHtml(t.id || '');
        html += `<div class="mine-todo" id="tl-item-${tId}">
          <span class="mine-todo-dot">${isToday ? '📌' : '📝'}</span>
          <div style="flex:1">
            <div>${escapeHtml(summary)}</div>
            <div class="mine-contact-sub" class="flex-wrap-gap">
              <span style="color:var(--dim)">${escapeHtml(dayStr)}</span>
              ${contactName ? `<span>👤 ${escapeHtml(contactName)}</span>` : ''}
              ${isToday ? `<span style="color:var(--accent)">${zh?'今天':'Today'}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
              <button onclick="showInteractionDetail('${tId}','${escapeHtml(t.contact||'')}')" class="btn-outline-sm">📋 ${zh?'详情':'Detail'}</button>
              <button onclick="editTimelineEntryFromList('${tId}','${escapeHtml(t.contact||'')}')" class="btn-outline-sm">${d.tl_edit}</button>
              <button onclick="deleteTimelineEntryFromList('${tId}',event)" class="btn-outline-sm">${d.tl_delete}</button>
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
  }
  content.innerHTML = html;
}

function filterTimelineSearch(q) {
  timelineSearchQuery = q;
  renderTimelineTab();
}

function editTimelineEntryFromList(tlId, contactId) {
  // Open contact detail then show timeline form
  openContactDetail(contactId).then(() => {
    setTimeout(() => showTimelineForm(contactId, tlId), 500);
  });
}

async function deleteTimelineEntryFromList(tlId, ev) {
  const zh = currentLang === 'zh';
  const ok = await confirmPop(ev, zh ? '确认删除这条互动记录？' : 'Delete this interaction?');
  if (!ok) return;
  try {
    const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
    await fetch(`${CLOUD_URL}/data/timeline?id=${encodeURIComponent(tlId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    // Remove from cache and re-render
    timelineCache = timelineCache.filter(t => t.id !== tlId);
    renderTimelineTab();
  } catch (e) {
    alert(e.message);
  }
}

// ── Todos tab (full CRUD) ──

let todosFilter = 'pending';
let todosDoneCache = [];  // cache for completed todos
let todosCache = [];

async function loadTodosTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    const [todosRes, contactsRes] = await Promise.all([
      mineApi('/data/todos'),
      mineApi('/data/contacts').catch(() => ({ contacts: [] })),
    ]);
    todosCache = todosRes.todos || [];
    const doneCount = todosRes.done_count || 0;
    mineCache.contacts = contactsRes.contacts || [];
    // Load done todos only if switching to done tab or done_count > 0
    if (todosFilter === 'done' && doneCount > 0) {
      // We need a way to get done todos — use a query param
      try {
        const doneRes = await mineApi('/data/todos?status=done');
        todosDoneCache = doneRes.todos || [];
      } catch { todosDoneCache = []; }
    }
    renderTodosTab(d, doneCount);
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

function renderTodosTab(d, doneCount) {
  const content = document.getElementById('mineContent');
  const today = localDateStr();

  // Filter tabs: pending | done
  let html = `<div class="mine-subtab" id="todosSubtab">
    <button class="mine-subtab-item ${todosFilter==='pending'?'active':''}" onclick="switchTodosFilter('pending')">${d.todo_filter_pending}${todosCache.length > 0 ? ` (${todosCache.length})` : ''}</button>
    <button class="mine-subtab-item ${todosFilter==='done'?'active':''}" onclick="switchTodosFilter('done')">${d.todo_filter_done}${doneCount > 0 ? ` (${doneCount})` : ''}</button>
  </div>`;

  // Add button (only in pending view)
  if (todosFilter === 'pending') {
    html += `<button onclick="showTodoForm()" style="width:100%;padding:10px;margin-bottom:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">+ ${d.todo_add}</button>`;
  }

  // Todo form (hidden by default)
  html += `<div id="todoForm" style="display:none;margin-bottom:12px"></div>`;

  // Contact map
  const contacts = mineCache.contacts || [];
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c.name);

  if (todosFilter === 'done') {
    // ── Done tab ──
    if (todosDoneCache.length === 0) {
      html += `<div class="mine-empty">${d.todo_empty}</div>`;
    } else {
      todosDoneCache.sort((a, b) => (b.completed_at || b.updated || b.created || '').localeCompare(a.completed_at || a.updated || a.created || ''));
      html += `<div class="mine-card">`;
      todosDoneCache.forEach(t => {
        const contactName = contactMap[t.contact] || '';
        const completedDate = t.completed_at ? new Date(t.completed_at).toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }) : '';
        const dueDate = (t.due || '').substring(0, 10);
        let dueDateDisplay = '';
        if (dueDate) {
          const d2 = new Date(dueDate);
          const weekdays = currentLang === 'zh' ? ['周日','周一','周二','周三','周四','周五','周六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          dueDateDisplay = `${d2.getMonth() + 1}月${d2.getDate()}日 ${weekdays[d2.getDay()]}`;
        }
        html += `<div class="mine-todo" id="todo-${escapeHtml(t.id)}" style="opacity:.6">
          <span class="mine-todo-dot">✓</span>
          <div style="flex:1">
            <div style="text-decoration:line-through">${t.task ? escapeHtml(t.task) : '<span style="color:#e74c3c;font-style:italic">（空待办）</span>'}</div>
            <div class="mine-contact-sub" class="flex-wrap-gap">
              ${dueDateDisplay ? `<span>📅 ${dueDateDisplay}</span>` : ''}
              ${contactName ? `<span>👤 ${escapeHtml(contactName)}</span>` : ''}
              ${completedDate ? `<span style="color:var(--dimmer)">✓ ${completedDate} ${currentLang==='zh'?'完成':'done'}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-top:4px">
              <button onclick="showTodoDetail('${escapeHtml(t.id)}')" class="btn-outline-sm">📋 ${d.todo_detail}</button>
              <button onclick="undoTodoDone('${escapeHtml(t.id)}')" class="btn-outline-sm">↩ ${d.todo_undone}</button>
              <button onclick="deleteTodo('${escapeHtml(t.id)}')" class="btn-outline-sm">${d.todo_delete}</button>
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
    }
  } else {
    // ── Pending tab: grouped by urgency ──
    if (todosCache.length === 0) {
      html += `<div class="mine-empty">${d.todo_empty}</div>`;
    } else {
      // Group todos: overdue / today / this_week / later / no_date
      const groups = { overdue: [], today: [], this_week: [], later: [], no_date: [] };
      todosCache.forEach(t => {
        const due = (t.due || '').substring(0, 10);
        if (!due) { groups.no_date.push(t); return; }
        const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
        if (delta < 0) groups.overdue.push(t);
        else if (delta === 0) groups.today.push(t);
        else if (delta <= 7) groups.this_week.push(t);
        else groups.later.push(t);
      });

      // Sort each group by due date
      ['overdue', 'today', 'this_week', 'later'].forEach(g => {
        groups[g].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
      });
      // No-date group: sort by priority then created
      groups.no_date.sort((a, b) => {
        const pri = (a.priority || 'P1').localeCompare(b.priority || 'P1');
        if (pri !== 0) return pri;
        return (a.created || '').localeCompare(b.created || '');
      });

      // Render groups
      const groupLabels = {
        overdue: { icon: '🔴', label: currentLang === 'zh' ? '已超期' : 'Overdue', cls: 'color:#e74c3c' },
        today: { icon: '⏰', label: currentLang === 'zh' ? '今天' : 'Today', cls: 'color:var(--accent)' },
        this_week: { icon: '📅', label: currentLang === 'zh' ? '本周内' : 'This week', cls: 'color:var(--dim)' },
        later: { icon: '🗓️', label: currentLang === 'zh' ? '之后' : 'Later', cls: 'color:var(--dim)' },
        no_date: { icon: '📝', label: currentLang === 'zh' ? '未设日期' : 'No date', cls: 'color:var(--dim)' },
      };

      ['overdue', 'today', 'this_week', 'later', 'no_date'].forEach(g => {
        if (groups[g].length === 0) return;
        const gl = groupLabels[g];
        html += `<div class="mine-section-title" style="${gl.cls}">${gl.icon} ${gl.label} <span style="font-size:.75em;opacity:.6">(${groups[g].length})</span></div>`;
        html += `<div class="mine-card">`;
        groups[g].forEach(t => {
          const due = (t.due || '').substring(0, 10);
          let dueLabel = '';
          if (due) {
            const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
            if (delta < 0) dueLabel = `${-delta}${d.todo_overdue}`;
            else if (delta === 0) dueLabel = d.todo_today;
            else dueLabel = `${delta}${d.todo_days_left}`;
          }
          const contactName = contactMap[t.contact] || '';
          const priorityBadge = t.priority === 'P1' ? '<span style="color:var(--accent);font-size:.7em">●</span>' : (t.priority === 'P0' ? '<span style="color:#e74c3c;font-size:.7em">●</span>' : '');
          const sourceBadge = t.source === 'ai_extract' ? '<span style="font-size:.65em;color:var(--dimmer);background:var(--surface);padding:1px 4px;border-radius:3px;margin-left:4px">AI</span>' : '';
          const taskText = t.task || '';
          const taskDisplay = taskText ? escapeHtml(taskText) : `<span style="color:#e74c3c;font-style:italic">（空待办，建议删除）</span>`;
          // Format due date: show absolute date + relative label
          const dueDate = (t.due || '').substring(0, 10);
          let dueDateDisplay = '';
          if (dueDate) {
            const d2 = new Date(dueDate);
            const weekdays = currentLang === 'zh' ? ['周日','周一','周二','周三','周四','周五','周六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const mmdd = `${d2.getMonth() + 1}月${d2.getDate()}日 ${weekdays[d2.getDay()]}`;
            dueDateDisplay = `${mmdd}${dueLabel ? ` (${dueLabel})` : ''}`;
          }
          html += `<div class="mine-todo" id="todo-${escapeHtml(t.id)}">
            <span class="mine-todo-dot ${g === 'overdue' ? 'mine-todo-overdue' : ''}">${priorityBadge}</span>
            <div style="flex:1">
              <div>${taskDisplay}${sourceBadge}</div>
              <div class="mine-contact-sub" class="flex-wrap-gap">
                ${dueDateDisplay ? `<span>📅 ${dueDateDisplay}</span>` : '<span style="color:var(--dimmer)">📅 未设日期</span>'}
                ${contactName ? `<span>👤 ${escapeHtml(contactName)}</span>` : '<span style="color:var(--dimmer)">👤 未关联</span>'}
                ${t.location ? `<span>📍 ${escapeHtml(t.location)}</span>` : ''}
              </div>
              <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                <button onclick="toggleTodoDone('${escapeHtml(t.id)}')" class="btn-outline-sm">✓ ${d.todo_done}</button>
                <button onclick="showTodoDetail('${escapeHtml(t.id)}')" class="btn-outline-sm">📋 ${d.todo_detail}</button>
                <button onclick="showTodoForm('${escapeHtml(t.id)}')" class="btn-outline-sm">${d.todo_edit}</button>
                <button onclick="postponeTodo('${escapeHtml(t.id)}', '${escapeHtml((t.due||'').slice(0,10))}')" class="btn-outline-sm">${currentLang==='zh'?'⏰ 推迟':'⏰ Postpone'}</button>
                <button onclick="cancelTodo('${escapeHtml(t.id)}')" class="btn-outline-sm">${currentLang==='zh'?'✕ 取消':'✕ Cancel'}</button>
                <button onclick="deleteTodo('${escapeHtml(t.id)}')" class="btn-outline-sm">${d.todo_delete}</button>
              </div>
            </div>
          </div>`;
        });
        html += `</div>`;
      });
    }
  }
  content.innerHTML = html;
}

function switchTodosFilter(filter) {
  todosFilter = filter;
  loadTodosTab();
}

function showTodoForm(todoId) {
  const d = I18N[currentLang];
  const form = document.getElementById('todoForm');
  if (!form) return;
  const editing = todoId ? todosCache.find(t => t.id === todoId) : null;
  const contacts = mineCache.contacts || [];
  const selectedContact = editing && editing.contact ? contacts.find(c => c.id === editing.contact) : null;
  const selectedContactName = selectedContact ? selectedContact.name : '';

  form.style.display = 'block';
  form.innerHTML = `
    <div class="mine-card" style="display:flex;flex-direction:column;gap:10px">
      <label style="font-size:.8em;color:var(--dim)">${d.todo_task}<input id="todo_task_input" value="${escapeHtml(editing?.task || '')}" class="input-field"></label>
      <div style="display:flex;gap:8px">
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.todo_due}<input id="todo_due_input" type="date" value="${escapeHtml((editing?.due || '').substring(0,10))}" class="input-field"></label>
        <label style="font-size:.8em;color:var(--dim)">${d.todo_priority}
          <select id="todo_priority_input" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.9em;margin-top:4px">
            <option value="P1" ${editing?.priority === 'P1' ? 'selected' : ''}>P1</option>
            <option value="P2" ${editing?.priority === 'P2' ? 'selected' : ''}>P2</option>
            <option value="P3" ${editing?.priority === 'P3' ? 'selected' : ''}>P3</option>
          </select>
        </label>
      </div>
      <div style="font-size:.8em;color:var(--dim);position:relative">${d.todo_contact}
        <input id="todo_contact_input" type="text" value="${escapeHtml(selectedContactName)}" placeholder="${currentLang==='zh'?'输入人名搜索…':'Search name…'}" autocomplete="off"
          class="input-field">
        <input id="todo_contact_id" type="hidden" value="${escapeHtml(editing?.contact || '')}">
        <div id="todoContactDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>
      </div>
      <label style="font-size:.8em;color:var(--dim)">${currentLang==='zh'?'地址':'Location'}<input id="todo_location_input" value="${escapeHtml(editing?.location || '')}" placeholder="${currentLang==='zh'?'如：上海·陆家嘴 / 北京·国贸':'e.g. Shanghai·Lujiazui'}" class="input-field"></label>
      <div style="display:flex;gap:8px">
        <button onclick="saveTodo('${escapeHtml(todoId || '')}')" style="flex:1;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${d.todo_save}</button>
        <button onclick="hideTodoForm()" class="btn-flex-item">${d.todo_cancel}</button>
      </div>
    </div>
  `;
  // Wire up contact search with event delegation (no inline handlers)
  const contactInput = document.getElementById('todo_contact_input');
  const dropdown = document.getElementById('todoContactDropdown');
  const idInput = document.getElementById('todo_contact_id');

  contactInput.addEventListener('input', () => {
    // Clear id if user modified the name
    const selected = (mineCache.contacts || []).find(c => c.id === idInput.value);
    if (selected && selected.name !== contactInput.value) idInput.value = '';
    filterTodoContacts(contactInput.value, dropdown);
  });
  contactInput.addEventListener('focus', () => filterTodoContacts(contactInput.value, dropdown));
  contactInput.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });
  // Event delegation: click on dropdown items
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cid]');
    if (!item) return;
    contactInput.value = item.dataset.cname;
    idInput.value = item.dataset.cid;
    dropdown.style.display = 'none';
  });
  document.getElementById('todo_task_input')?.focus();
}

function filterTodoContacts(query, dropdown) {
  if (!dropdown) dropdown = document.getElementById('todoContactDropdown');
  if (!dropdown) return;
  const contacts = mineCache.contacts || [];
  const q = (query || '').trim().toLowerCase();
  let filtered = contacts;
  if (q) {
    filtered = contacts.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.aliases || []).some(a => (a || '').toLowerCase().includes(q)) ||
      (c.relation || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q)
    );
  }
  if (filtered.length === 0) {
    dropdown.innerHTML = `<div style="padding:8px 12px;color:var(--dimmer);font-size:.85em">${currentLang==='zh'?'未找到匹配联系人':'No matching contact'}</div>`;
  } else {
    dropdown.innerHTML = filtered.slice(0, 30).map(c => {
      const subInfo = [c.relation, c.role].filter(Boolean).join(' · ');
      return `<div data-cid="${escapeHtml(c.id)}" data-cname="${escapeHtml(c.name)}" style="padding:8px 12px;cursor:pointer;font-size:.9em;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''">
        ${escapeHtml(c.name)}${subInfo ? ` <span style="color:var(--dimmer);font-size:.8em">${escapeHtml(subInfo)}</span>` : ''}
      </div>`;
    }).join('');
  }
  dropdown.style.display = 'block';
}

function hideTodoForm() {
  const form = document.getElementById('todoForm');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
}

async function saveTodo(todoId) {
  const d = I18N[currentLang];
  const task = document.getElementById('todo_task_input')?.value?.trim();
  if (!task) return;
  const due = document.getElementById('todo_due_input')?.value || '';
  const priority = document.getElementById('todo_priority_input')?.value || 'P1';
  // Use hidden id field (set by search selection), not the text input
  let contact = document.getElementById('todo_contact_id')?.value || '';
  // Fallback: if no id but user typed a name, try exact match by name
  if (!contact) {
    const typedName = document.getElementById('todo_contact_input')?.value?.trim() || '';
    if (typedName) {
      const matched = (mineCache.contacts || []).find(c => c.name === typedName);
      if (matched) contact = matched.id;
      else {
        // No exact match — pass contact name, backend will auto-create
        contact = typedName;
      }
    }
  }

  const body = { task, due, priority, contact_id: contact };
  const location = document.getElementById('todo_location_input')?.value?.trim() || '';
  if (location) body.location = location;
  if (todoId) body.id = todoId; // Update existing

  try {
    const result = await mineApi('/data/todos', 'POST', body);
    hideTodoForm();
    // Show dedup hint if backend detected duplicate
    if (result.dedup) {
      addMsg('ai', currentLang === 'zh' ? '这条待办已存在，已更新截止日期' : 'This todo already exists, due date updated');
    }
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

async function toggleTodoDone(todoId) {
  const d = I18N[currentLang];
  try {
    await mineApi('/data/todos/done', 'POST', { id: todoId });
    // Reload from API to ensure consistent state (avoid stale cache)
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

async function postponeTodo(todoId, currentDue) {
  const zh = currentLang === 'zh';
  // Default: 1 week from today (or 1 week from current due if due is in future)
  const today = new Date();
  const dueDate = currentDue ? new Date(currentDue) : today;
  const baseDate = dueDate > today ? dueDate : today;
  const defaultDate = new Date(baseDate.getTime() + 7 * 86400000);
  const defaultStr = defaultDate.toISOString().slice(0, 10);

  const newDue = prompt(zh ? `推迟到哪天？\n（格式：YYYY-MM-DD，默认推迟一周）` : `Postpone to which date?\n(Format: YYYY-MM-DD, default: +1 week)`, defaultStr);
  if (!newDue) return;
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDue)) {
    alert(zh ? '日期格式不正确，请用 YYYY-MM-DD' : 'Invalid date format, use YYYY-MM-DD');
    return;
  }
  try {
    await mineApi('/data/todos/postpone', 'POST', { id: todoId, due: newDue });
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

async function cancelTodo(todoId) {
  const zh = currentLang === 'zh';
  if (!confirm(zh ? '确定取消此待办？（取消后不再显示在待办列表，但不会删除记录）' : 'Cancel this todo? (Removed from pending list, record kept)')) return;
  try {
    await mineApi('/data/todos/cancel', 'POST', { id: todoId });
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

async function undoTodoDone(todoId) {
  try {
    // Reopen: set status back to pending
    await mineApi('/data/todos/reopen', 'POST', { id: todoId });
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteTodo(todoId) {
  const d = I18N[currentLang];
  if (!confirm(d.todo_confirm_delete)) return;
  try {
    const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
    if (!token) { alert('No auth token'); return; }
    const resp = await fetch(`${CLOUD_URL}/data/todos?id=${encodeURIComponent(todoId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }
    // Reload from API to ensure consistent state
    await loadTodosTab();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// ── Onboarding: conversational activation ──

let onboardingExtractedContacts = [];

async function checkOnboardingNeeded() {
  if (localStorage.getItem('welian_onboarding_done') === '1') return;
  if (simulationMode) return;
  try {
    const token = await getClerkToken();
    if (!token) return;
    const resp = await fetch(`${CLOUD_URL}/data/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const contacts = data.contacts || [];
    if (contacts.length > 0) {
      localStorage.setItem('welian_onboarding_done', '1');
      return;
    }
    startOnboarding();
  } catch (e) {
    console.log('Onboarding check failed:', e.message);
  }
}

function startOnboarding() {
  onboardingExtractedContacts = [];
  renderOnboardingChat();
  document.getElementById('onboardingOverlay').classList.add('show');
  document.getElementById('onboardingModal').classList.add('show');
}

function closeOnboarding() {
  document.getElementById('onboardingOverlay').classList.remove('show');
  document.getElementById('onboardingModal').classList.remove('show');
}

function renderOnboardingChat() {
  const body = document.getElementById('onboardingBody');
  const zh = currentLang === 'zh';
  body.innerHTML = `
    <div style="padding:8px 0">
      <div id="onboardingChatLog" style="min-height:120px;margin-bottom:16px">
        <div class="mine-card" style="padding:14px;font-size:.9em;line-height:1.7;background:var(--accent-bg);border:none">
          ${zh
            ? '你好！我是小维 🌱<br><br>最近和谁聊过？随便说一句就行——<br>比如"昨天和老王吃了饭，前天跟张总开了个会"'
            : 'Hi! I\'m Welian 🌱<br><br>Who have you talked to recently? Just say it naturally —<br>e.g. "Had lunch with John yesterday, met with Sarah about the project"'}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <textarea id="onboardingInput" placeholder="${zh ? '说一句…' : 'Say something…'}"
          style="flex:1;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:.9em;background:var(--surface);color:var(--text);box-sizing:border-box;resize:none;font-family:inherit;min-height:44px;max-height:120px"
          rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitOnboardingChat()}"></textarea>
        <button onclick="submitOnboardingChat()" style="padding:10px 16px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;font-size:.9em;white-space:nowrap">${zh ? '发送' : 'Send'}</button>
      </div>
      <div id="onboardingResult" style="margin-top:16px"></div>
    </div>
  `;
  setTimeout(() => document.getElementById('onboardingInput')?.focus(), 100);
}

async function submitOnboardingChat() {
  const input = document.getElementById('onboardingInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const zh = currentLang === 'zh';
  const log = document.getElementById('onboardingChatLog');
  // Show user message
  log.innerHTML += `<div class="mine-card" style="padding:10px 14px;font-size:.9em;margin-top:8px;text-align:right">${escapeHtml(text)}</div>`;
  input.value = '';
  input.disabled = true;

  const resultEl = document.getElementById('onboardingResult');
  resultEl.innerHTML = `<div style="color:var(--dim);padding:8px;font-size:.85em">${zh ? '小维正在提取联系人…' : 'Extracting contacts…'}</div>`;

  try {
    const token = await getClerkToken();
    // Use extract_intent to parse the user's natural text and auto-create contacts
    const resp = await fetch(`${CLOUD_URL}/ai/extract_intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ text, session_token: token, onboarding: true }),
    });
    const data = await resp.json();

    // Collect created contacts from action results
    const created = (data.action_results || []).filter(r => r.type === 'add_contact' && r.ok);
    const timelineCreated = (data.action_results || []).filter(r => r.type === 'add_timeline' && r.ok);
    onboardingExtractedContacts = created.map(r => r.name);

    // Fetch actual contacts to confirm
    const contactsResp = await fetch(`${CLOUD_URL}/data/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const contactsData = await contactsResp.json();
    const allContacts = contactsData.contacts || [];
    const names = allContacts.map(c => c.name);

    if (names.length > 0) {
      log.innerHTML += `<div class="mine-card" style="padding:14px;font-size:.9em;margin-top:8px;line-height:1.7;background:var(--accent-bg);border:none">
        ${zh ? `✅ 我从你说的里面找到了 <strong>${names.length}</strong> 个人：` : `✅ I found <strong>${names.length}</strong> people from what you said:`}<br>
        ${names.map(n => `<span style="display:inline-block;margin:2px 4px;padding:2px 10px;background:var(--surface);border-radius:12px;font-size:.85em">${escapeHtml(n)}</span>`).join('')}
      </div>`;
      resultEl.innerHTML = `
        <div style="padding:12px 0">
          <p style="font-size:.85em;color:var(--dim);margin-bottom:12px">${zh ? '想再加几个？继续说就行。不然就可以开始了 👇' : 'Want to add more? Just keep talking. Otherwise, let\'s get started 👇'}</p>
          <div style="display:flex;gap:8px">
            <button onclick="renderOnboardingChat()" style="flex:1;padding:10px;background:none;border:1px solid var(--border);border-radius:10px;color:var(--dim);cursor:pointer;font-family:inherit;font-size:.9em">${zh ? '继续说' : 'Say more'}</button>
            <button onclick="finishOnboarding()" style="flex:1;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;font-size:.9em">${zh ? '开始使用 →' : 'Get started →'}</button>
          </div>
        </div>
      `;
    } else {
      log.innerHTML += `<div class="mine-card" style="padding:14px;font-size:.9em;margin-top:8px;line-height:1.7;background:var(--accent-bg);border:none">
        ${zh ? '没提取到人名，再试试？比如"昨天和老王吃了饭"' : 'Couldn\'t find any names. Try again? e.g. "Had lunch with John yesterday"'}
      </div>`;
      resultEl.innerHTML = '';
      input.disabled = false;
      input.focus();
    }
  } catch (e) {
    resultEl.innerHTML = `<div style="color:var(--dim);padding:8px;font-size:.85em">${zh ? '出错了：' : 'Error: '}${e.message}</div>`;
    input.disabled = false;
  }
}

async function finishOnboarding() {
  localStorage.setItem('welian_onboarding_done', '1');
  closeOnboarding();
  mineCache = {};
  const zh = currentLang === 'zh';
  if (onboardingExtractedContacts.length > 0) {
    addMsg('ai', zh
      ? `欢迎！我记下了 ${onboardingExtractedContacts.length} 个人：${onboardingExtractedContacts.map(escapeHtml).join('、')}。让我看看这周该联系谁… 🌱`
      : `Welcome! I saved ${onboardingExtractedContacts.length} people: ${onboardingExtractedContacts.map(escapeHtml).join(', ')}. Let me check who you should reach out to this week… 🌱`);
    // P0-3: Immediate value delivery — call advise engine right after onboarding
    try {
      const token = await getClerkToken();
      const resp = await fetch(`${CLOUD_URL}/ai/advise_cloud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_token: token }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const advise = data.result || '';
        if (advise) {
          addMsg('ai', advise);
        }
      }
    } catch (e) {
      console.log('[onboarding] first advise failed:', e.message);
    }
  }
}

// ── Inline confirm popup (positions near click) ──
function confirmPop(ev, message) {
  return new Promise(resolve => {
    const zh = currentLang === 'zh';
    const x = ev?.clientX ?? window.innerWidth / 2;
    const y = ev?.clientY ?? window.innerHeight / 2;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent';
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:10000;max-width:280px;font-size:.85em`;
    const left = Math.min(x + 8, window.innerWidth - 290);
    const top = Math.min(y + 8, window.innerHeight - 120);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.innerHTML = `<div style="margin-bottom:12px;color:var(--text);line-height:1.5">${message}</div><div style="display:flex;gap:8px;justify-content:flex-end"><button id="cpCancel" style="padding:6px 16px;border:1px solid var(--border);background:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.9em;color:var(--dim)">${zh?'取消':'Cancel'}</button><button id="cpOk" style="padding:6px 16px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.9em">${zh?'删除':'Delete'}</button></div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = (result) => { document.body.removeChild(overlay); resolve(result); };
    box.querySelector('#cpOk').onclick = () => close(true);
    box.querySelector('#cpCancel').onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
}

// ── Cookie consent ──
function initCookieBanner() {
  if (localStorage.getItem('welian_cookie_ok')) return;
  const banner = document.getElementById('cookie-banner');
  if (!banner) return;
  // i18n
  const zh = currentLang === 'zh';
  const text = document.getElementById('cookieText');
  if (!zh) text.innerHTML = 'This site uses cookies to provide service experience. By continuing, you agree. See <a href="/privacy.html" style="color:var(--accent)">Privacy Policy</a>.';
  banner.style.display = 'flex';
  // Buttons
  const btns = banner.querySelectorAll('button');
  btns[0].textContent = zh ? '接受' : 'Accept';
  btns[1].textContent = zh ? '仅必要' : 'Essential only';
}
function acceptCookies() {
  localStorage.setItem('welian_cookie_ok', '1');
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.style.display = 'none';
}

// ── Init ──
applyLang(currentLang);
initClerk();
initCookieBanner();
// Desktop: left sidebar starts collapsed, hover trigger zone expands it
if (window.innerWidth > 768) {
  const sidebarEl = document.getElementById('sidebar');
  const hoverZone = document.getElementById('sidebarHoverZone');
  sidebarEl.classList.add('collapsed');
  hoverZone.addEventListener('mouseenter', () => {
    if (!sidebarEl.classList.contains('collapsed')) return;
    sidebarEl.classList.add('hover-open');
    loadSessionList();
  });
  sidebarEl.addEventListener('mouseleave', () => {
    sidebarEl.classList.remove('hover-open');
  });
} else {
  // Mobile: show hamburger button (sidebar starts hidden, tap to open)
  const openBtn = document.getElementById('sidebarOpenBtn');
  if (openBtn) openBtn.style.display = 'inline-block';
}
// Desktop: right sidebar hover-to-show (mirrors left sidebar)
if (window.innerWidth >= 900) {
  const rightEl = document.getElementById('desktopSidebar');
  const rightZone = document.getElementById('rightHoverZone');
  if (rightEl && rightZone) {
    rightZone.addEventListener('mouseenter', () => {
      rightEl.classList.add('hover-open');
    });
    rightEl.addEventListener('mouseleave', () => {
      rightEl.classList.remove('hover-open');
    });
  }
}
// Fetch pricing for cost preview
fetch(`${CLOUD_URL}/ai/pricing`).then(r => r.json()).then(p => { window._currentPricing = p; }).catch(() => {});
// Preload weather (fills weatherCache with city name for chat context)
fetchWeather().catch(() => {});
