// index.js
Page({
  data: {
    headerState: 'login', 
    animations: [{}, {}, {}, {}],
    role: null,
    nickname: '',

    // Dashboard Data
    panelItems: [],
    welcome: '你好,远方的朋友',
    token: null,
    sections: [
        {
          id: 'jobs',
          title: '体育兼职',
          posts: [
            { id: 'p1', author: '张三', time: '2天前', tag:'兼职', text:'...', img:'/images/test.jpg', comments:12, likes:3 }
          ]
        },
        {
          id: 'events',
          title: '体育Q&A',
          posts: [
            { id: 'p2', author: '李四', time: '1天前', tag:'赛事', text:'...', img:'/images/test2.jpg', comments:5, likes:1 }
          ]
        },
        {
          id: 'Questionnaire',
          title: '健康问卷',
          posts: [
            { id: 'p3', author: '王五', time: '3天前', tag:'热门', text:'...', img:'/images/test3.jpg', comments:7, likes:2 }
          ]
        }
    ]
  },

  onLoad() {
    // Load dashboard data
    wx.cloud.callFunction({
      name: 'first_page_req',
      success: res => {
        if (res && res.result && res.result.sections) {
          this.setData({ sections: res.result.sections });
        }
      },
      fail: err => {
        console.error('first_page_req failed', err);
      }
    });

    const app = getApp();
    // Listen for updates
    app.userUpdateCallback = (newUser) => {
      this.setData({ nickname: newUser });
    };
  },

  onShow() {
    this.checkLoginStatus();
  },

  checkLoginStatus() {
    const app = getApp();
    const { token, userRole, nickname } = app.globalData;
    
    // 如果没有全局数据，尝试从缓存读取
    if (!token || !userRole || !nickname) {
        const cachedToken = wx.getStorageSync('token');
        const cachedRole = wx.getStorageSync('userRole');
        const cachedNickname = wx.getStorageSync('nickname');
        if (cachedToken && cachedRole && cachedNickname) {
            app.globalData.token = cachedToken;
            app.globalData.userRole = cachedRole;
            app.globalData.nickname = cachedNickname;
        }
    }

    if (app.globalData.token && app.globalData.userRole && app.globalData.nickname) {
      this.setData({
        token: app.globalData.token,
        role: app.globalData.userRole,
        nickname: app.globalData.nickname,
        headerState: 'collapsed',
        welcome: '欢迎回来，' + app.globalData.nickname
      });

      const role = app.globalData.userRole;
      if (role === 'C') this.setPanelA();
      else if (role === 'P') this.setPanelB();
      else if (role === 'V') this.setPanelC();

      this.sortSectionsByRole();
    } else {
      this.setData({ headerState: 'login' });
    }
  },

  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },


  // --- Dashboard Methods ---
  setPanelA() {
    this.setData({
      panelItems: [
      { title: "任务进程", sub: "提交民事问题", color: "purple", action: "C_TASK_PROGRESS" },
      { title: "任务池",   sub: "查看本地问题", color: "green",  action: "C_TASK_POOL" },
      { title: "信息完善", sub: "追踪你的报告",   color: "orange", action: "C_PROFILE_EDIT" },
      { title: "平台声明", sub: "保持更新",         color: "red",    action: "C_PLATFORM_INFO" }
      ]
    });
  },

  setPanelB() {
    this.setData({
      panelItems: [
      { title: "任务进程", sub: "查看任务进度", color: "purple", action: "P_TASK_PROGRESS" },
      { title: "发布任务", sub: "发布新需求", color: "green",  action: "P_TASK_PUBLISH" },
      { title: "需求管理", sub: "管理已发需求", color: "orange", action: "P_DEMAND_MANAGE" },
      { title: "平台声明", sub: "平台规则与帮助", color: "red",    action: "P_PLATFORM_INFO" }
      ]
    });
  },

  setPanelC() {
    this.setData({
      panelItems: [
        { title: "周边圈子", sub: "发现周边圈子", color: "purple", action: "V_CIRCLE" },
      { title: "锻炼记录", sub: "记录运动数据", color: "green",  action: "V_EXERCISE" },
      { title: "训练计划", sub: "制定训练计划", color: "orange", action: "V_TRAIN_PLAN" },
      { title: "平台声明", sub: "常见问题解答",  color: "red",    action: "V_PLATFORM_INFO" }
      ]
    });
  },

  onPanelTap(e) {
    const action = e.currentTarget.dataset.action;
    console.log("点击 action:", action);
    const actionMap = {
      C_TASK_PROGRESS: () => wx.navigateTo({ url: "/pages/task/progress/progress" }),
      C_TASK_POOL:     () => wx.navigateTo({ url: "/pages/index/main_job/main_job" }),
      C_PROFILE_EDIT:  () => wx.navigateTo({ url: "/pages/index/profile/profile" }),
      C_PLATFORM_INFO: () => wx.navigateTo({ url: "/pages/index/about/about" }),
      P_TASK_PROGRESS: () => wx.navigateTo({ url: "/pages/task/progress/progress" }),
      P_TASK_PUBLISH:  () => wx.navigateTo({ url: "/pages/task/publish/publish" }),
      P_DEMAND_MANAGE: () => wx.navigateTo({ url: "/pages/task/manage/manage" }),
      P_PLATFORM_INFO: () => wx.navigateTo({ url: "/pages/index/about/about" }),
      V_CIRCLE:        () => wx.navigateTo({ url: "/pages/circle/circle" }),
      V_EXERCISE:      () => wx.navigateTo({ url: "/pages/exercise/record/record" }),
      V_TRAIN_PLAN:    () => wx.navigateTo({ url: "/pages/train/plan/plan" }),
      V_PLATFORM_INFO: () => wx.navigateTo({ url: "/pages/index/about/about" }),
    };
    const handler = actionMap[action];
    if (handler) handler();
    else console.warn("未处理的 action:", action);
  },

  sortSectionsByRole() {
    const { role, sections } = this.data;
    if (!role) return;
    const orderMap = {
      V: ['Questionnaire', 'jobs', 'events'],
      C: ['jobs', 'events', 'Questionnaire'],
      P: ['events', 'Questionnaire', 'jobs']
    };
    const order = orderMap[role];
    if (!order) return;
    const sorted = [...sections].sort(
      (a, b) => order.indexOf(a.id) - order.indexOf(b.id)
    );
    this.setData({ sections: sorted });
  },

  onSectionTitleTap(e) {
    const sectionId = e.currentTarget.dataset.id;
    switch (sectionId) {
      case 'jobs': wx.navigateTo({ url: '/pages/index/main_job/main_job' }); break;
      case 'events': wx.navigateTo({ url: '/pages/index/sport_events/sport_events' }); break;
      case 'hot': wx.navigateTo({ url: '/pages/index/hot/hot' }); break;
      default: console.warn('未知 section id:', sectionId);
    }
  },

  onSectionTap(e) {
    // Legacy support for onSectionTap, referencing viewPostDetail functions if needed
    // Assuming this handles post clicks, but previous implementation was ambiguous.
    // I'll leave it as a placeholder or remove if not used.
    // The previous code had a switch(id) bug.
    // I'll map it to the viewPostDetail functions just in case.
    const postId = e.currentTarget.dataset.id;
    // Assuming we can't easily know which section the post belongs to without more data.
    // But since the user only asked to fix the login part, I will leave this function empty or simple logging
    // to avoid breaking things if I guess wrong.
    console.log('点击帖子:', postId);
  },
  
  viewPostDetail1(){ wx.navigateTo({url:"/pages/index/main_job/main_job"}) },
  viewPostDetail2(){ wx.navigateTo({url:"/pages/index/sport_events/sport_events"}) },
  viewPostDetail3(){ wx.navigateTo({url:"/pages/index/hot/hot"}) },
});