Page({
  data: {
    chatList: [],
    targetusername: '',
    isLoading: false,
    hasUserInfo: false
  },

  onLoad() {
    // Initial load
    this.checkLoginAndFetch()
  },

  onShow() {
    // Refresh on show (e.g. returning from chat detail)
    this.checkLoginAndFetch()
  },

  onPullDownRefresh() {
    this.fetchChatList()
      .then(() => {
        wx.stopPullDownRefresh()
      })
      .catch(() => {
        wx.stopPullDownRefresh()
      })
  },

  checkLoginAndFetch() {
    const userId = wx.getStorageSync('token')
    const openid = wx.getStorageSync('openid') || getApp().globalData.openid
    
    if (userId || openid) {
      this.setData({ hasUserInfo: true })
      // If it's the first load (empty list), show loading
      if (this.data.chatList.length === 0) {
          this.setData({ isLoading: true })
      }
      this.fetchChatList().catch(() => {
        // Error already handled in fetchChatList (toast shown)
      })
    } else {
      this.setData({ hasUserInfo: false, chatList: [] })
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
    }
  },

  fetchChatList() {
    // Avoid double fetching if already loading
    // if (this.data.isLoading && this.data.chatList.length > 0) return Promise.resolve() 
    // Commented out to allow pull-down refresh even if technically "loading" state might be lingering, 
    // or just let it pass. Better logic:
    
    const userId = wx.getStorageSync('token')
    
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'conversation_list',
        data: { userId },
        success: res => {
          if (res.result.code === 0) {
            console.log('[private_talk] fetchChatList success:', res.result.data);
            this.setData({
              chatList: res.result.data || [],
              isLoading: false
            })
            resolve(res.result.data)
          } else {
            console.error('[private_talk] fetchChatList error:', res.result);
            wx.showToast({
              title: res.result.msg || '加载失败',
              icon: 'none'
            })
            this.setData({ isLoading: false })
            reject(res.result)
          }
        },
        fail: err => {
          console.error('[private_talk] fetchChatList cloud call fail:', err);
          wx.showToast({
            title: '网络错误',
            icon: 'none'
          })
          this.setData({ isLoading: false })
          reject(err)
        },
        complete: () => {
           // loading state handled in success/fail to prevent flickering if called multiple times
           wx.hideLoading()
        }
      })
    })
  },

  openChat(e) {
    const conversationId = e.currentTarget.dataset.conversationId
    const type = e.currentTarget.dataset.type || 'private'
    console.log(
      '点击的conversationId', conversationId, 'type', type
    );
    wx.navigateTo({
      url: `/pages/private_talk/private_talk_detail/private_talk_detail?conversationId=${conversationId}&type=${type}`
    })
  }
  
})
