Page({
  data: {
    isAuthorized: false,
    authKey: '',
  },

  onLoad() {
    // Optional: check stored auth to skip login
    // const isAuth = wx.getStorageSync('dev_auth');
    // if (isAuth) this.setData({ isAuthorized: true });
  },

  inputAuthKey(e) {
    this.setData({ authKey: e.detail.value })
  },

  checkAuth() {
    if (this.data.authKey === 'szdx20252026') {
      this.setData({ isAuthorized: true })
      wx.showToast({ title: '验证通过', icon: 'success' })
      // wx.setStorageSync('dev_auth', true); // Uncomment to persist
    } else {
      wx.showToast({ title: '密钥错误', icon: 'none' })
    }
  },

  handleClearCache() {
      wx.clearStorageSync();
      wx.showToast({ title: '缓存已清理', icon: 'success' });
  },
})