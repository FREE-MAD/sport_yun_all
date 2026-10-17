// app.js
App({
  onLaunch: function () {
    
    this.globalData = {
      // env 参数说明：
      //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
      //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
      //   如不填则使用默认环境（第一个创建的环境）
      env: "cloud1-6gh7jgl8c5b16a83"
      // cloud.init({ env: 'cloud1-6gh7jgl8c5b16a83' })
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
    const role = wx.getStorageSync('userRole');
    const nickname = wx.getStorageSync('nickname');
    const token = wx.getStorageSync('token');
    const avatarUrl = wx.getStorageSync('avatarUrl');

    if (nickname) this.globalData.nickname = nickname;
    if (token) this.globalData.token = token;
    if (avatarUrl) this.globalData.avatarUrl = avatarUrl;

    if (role && token) {
      this.globalData.userRole = role;
      this.globalData.needChooseRole = false;
      console.log("App 启动：身份已绑定 →", role);
    } else {
      this.globalData.needChooseRole = true;
      console.log("App 启动：需要选择身份");
    }

    if (token) {
      this.refreshUserInfo();
    }
  },

  refreshUserInfo: function() {
    // 这里可以添加从云端刷新用户信息的逻辑
    // 刷新完成后，执行回调通知
    if (this.globalDataReadyCallback) {
      this.globalDataReadyCallback(this.globalData)
    }
  }
});
