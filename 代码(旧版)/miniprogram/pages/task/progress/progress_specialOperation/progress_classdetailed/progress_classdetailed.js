const app = getApp();

Page({
  data: {
    lesson: {},
    lessonIndex: 0,
    displayIndex: 0,
    orderId: '',
    isCoach: false,      // current user is the accepted coach
    isRoleCoach: false,  // current user role is coach
    isOwner: false,      // current user is the publisher
    
    // UI controls
    summaryInput: '',
    showSummaryModal: false,
    
    // Media
    mediaList: [], // Array of fileIDs
    
    // Payment Info
    paymentInfo: null
  },

  onLoad(options) {
    if (options.lesson) {
      console.log('[progress_classdetailed] onLoad options:', options);
      try {
        const lesson = JSON.parse(decodeURIComponent(options.lesson));
        const lessonIndex = parseInt(options.index || 0);
        const orderId = options.orderId || '';
        const isCoach = options.isCoach === 'true';
        const isRoleCoach = options.isRoleCoach === 'true';
        const isOwner = options.isOwner === 'true';

        this.setData({ 
            lesson, 
            lessonIndex,
            displayIndex: lessonIndex + 1,
            orderId,
            isCoach,
            isRoleCoach,
            isOwner,
            mediaList: lesson.media || [],
            summaryInput: lesson.summary || ''
        });

        wx.setNavigationBarTitle({
          title: `第 ${lessonIndex + 1} 课详情`
        });
        
        // Moved to onShow to support refresh when returning to page
      } catch (e) {
        console.error('解析课程详情失败', e);
      }
    }
  },

  onShow() {
    if (this.data.orderId) {
        this.refreshLessonData();
        // Start polling
        this.startPolling();
    }
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling(); // Clear existing timer
    this.data.pollingTimer = setInterval(() => {
        if (this.data.orderId) {
            this.refreshLessonData(true); // silent refresh
        }
    }, 5000);
  },

  stopPolling() {
    if (this.data.pollingTimer) {
        clearInterval(this.data.pollingTimer);
        this.data.pollingTimer = null;
    }
  },

  onPullDownRefresh() {
    if (this.data.orderId) {
        this.refreshLessonData().then(() => {
            wx.stopPullDownRefresh();
        });
    } else {
        wx.stopPullDownRefresh();
    }
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${m}-${d} ${h}:${min}`;
  },

  /**
   * Refresh lesson data
   * @param {boolean} silent - Whether to suppress loading indicator
   */
  async refreshLessonData(silent = false) {
      if (!silent) wx.showLoading({ title: '刷新中' });
      try {
          const res = await wx.cloud.callFunction({
              name: 'execution_order',
              data: {
                  action: 'get_oneorder',
                  orderId: this.data.orderId
              }
          });
          
          if (res.result.code === 0) {
              const order = res.result.data;
              const caller = res.result.caller || {}; // 从后端获取调用者信息
              
              // 重新校准权限 (确保 isCoach 准确反映当前用户是否为接单教练)
              const app = getApp();
              const openid = caller.openid || app.globalData.openid || wx.getStorageSync('openid');
              const userId = wx.getStorageSync('token');
              
              // --- 详细权限校验日志 ---
              console.group('[progress_classdetailed] 权限与按钮显示校验');
              console.log('1. 当前环境:', {
                  orderId: this.data.orderId,
                  userId,
                  openid,
                  caller_openid: caller.openid, // 后端返回的 openid
                  isCoachParam: this.data.isCoach,
                  isRoleCoachParam: this.data.isRoleCoach
              });
              
              console.log('2. 订单关键信息:', {
                  acceptorId: order.acceptorId,
                  acceptorOpenid: order.acceptorOpenid,
                  publisher_openid: order.publisher_openid,
                  status: order.status
              });

              const isAcceptor = (order.acceptorId && order.acceptorId === userId) || 
                                 (order.acceptorOpenid && order.acceptorOpenid === openid);
              
              console.log('3. 身份计算:', {
                  isAcceptor: isAcceptor,
                  reason: isAcceptor ? '用户ID或OpenID匹配acceptor' : '无匹配',
                  current_isCoach: this.data.isCoach
              });

              if (isAcceptor && !this.data.isCoach) {
                  console.log('[Fix] 修正 isCoach 权限: 设为 true (检测到是接单人)');
                  this.setData({ isCoach: true });
              }
              
              // 如果 isAcceptor 为 false 但 isCoach 为 true，暂不强制覆盖，防止因数据同步延迟导致按钮消失
              if (!isAcceptor && this.data.isCoach) {
                  console.warn('[Warning] 权限校验警告: 前端计算非接单人，但页面参数标识为教练 (可能是缓存或延迟)');
              }

              // --- 按钮显示条件预判 ---
              if (order.schedule && order.schedule[this.data.lessonIndex]) {
                  const lesson = order.schedule[this.data.lessonIndex];
                  const status = lesson.status || 'PENDING';
                  const isCoach = this.data.isCoach || isAcceptor; // 预测最终 isCoach
                  const isRoleCoach = this.data.isRoleCoach;
                  
                  console.log('4. 课程状态与按钮预判:', {
                      lessonStatus: status,
                      final_isCoach: isCoach,
                      final_isRoleCoach: isRoleCoach
                  });

                  // 模拟 WXML 中的 wx:if 逻辑
                  const logBtn = (name, show) => console.log(`   - [按钮] ${name}: ${show ? '显示 ✅' : '隐藏 ❌'}`);
                  
                  // PENDING
                  if (!status || status === 'PENDING') {
                      logBtn('发起支付单 (教练)', isCoach);
                      logBtn('等待教练发起提示 (!教练)', !isCoach);
                  }
                  
                  // WAIT_PAYMENT
                  if (status === 'WAIT_PAYMENT') {
                      logBtn('立即支付 (家长)', !isCoach && !isRoleCoach);
                      logBtn('等待家长支付提示', isCoach || isRoleCoach);
                  }

                  // PAID
                  if (status === 'PAID') {
                      logBtn('确认已到达/就绪 (教练)', isCoach);
                      logBtn('等待教练就绪提示', !isCoach);
                  }

                  // COACH_READY
                  if (status === 'COACH_READY') {
                      logBtn('确认开始上课 (家长)', !isCoach && !isRoleCoach);
                      logBtn('等待家长确认提示', !isCoach && isRoleCoach);
                      logBtn('结束课程 (教练-容错)', isCoach);
                  }

                  // PARENT_CONFIRMED
                  if (status === 'PARENT_CONFIRMED') {
                      logBtn('结束课程 (教练)', isCoach);
                  }

                  // COMPLETED_BY_COACH
                  if (status === 'COMPLETED_BY_COACH') {
                      logBtn('确认下课/支付 (家长)', !isCoach && !isRoleCoach);
                      logBtn('等待家长确认提示', isCoach || isRoleCoach);
                  }
              }
              console.groupEnd();
              // --- 日志结束 ---

              if (order.schedule && order.schedule[this.data.lessonIndex]) {
                  const lesson = order.schedule[this.data.lessonIndex];
                  
                  // Extract payment info
                  let paymentInfo = null;
                  if (lesson.logs && lesson.logs.length > 0) {
                      const payLog = lesson.logs.find(l => l.action === 'pay_success');
                      if (payLog) {
                          const payerId = payLog.userId;
                          let payerName = '家长';
                          if (order.participants) {
                              const p = order.participants.find(p => p.userId === payerId || p.openid === payerId);
                              if (p && p.userInfo) {
                                  payerName = p.userInfo.nickName || '家长';
                              }
                          }
                          paymentInfo = {
                              payer: payerName,
                              time: this.formatTime(payLog.time)
                          };
                      }
                  }

                  this.setData({
                      lesson,
                      'lesson.startedAt': lesson.startedAt ? this.formatTime(lesson.startedAt) : '',
                      'lesson.completedAt': lesson.completedAt ? this.formatTime(lesson.completedAt) : '',
                      mediaList: lesson.media || [],
                      summaryInput: lesson.summary || '',
                      paymentInfo
                  });
              }
          }
      } catch (err) {
          console.error('刷新失败', err);
      } finally {
          wx.hideLoading();
      }
  },

  /**
   * Handle lesson status changes (Handshake)
   */
  async handleLessonHandshake(e) {
    const subAction = e.currentTarget.dataset.subaction;
    const orderId = this.data.orderId;
    const index = this.data.lessonIndex;

    if (!subAction || !orderId) return;

    let confirmContent = '确认执行此操作吗？';
    if (subAction === 'coach_ready') confirmContent = '确认开始上课？';
    if (subAction === 'parent_confirm') confirmContent = '确认开始上课？';
    if (subAction === 'coach_complete') confirmContent = '确认下课？';
    if (subAction === 'parent_complete') confirmContent = '确认课程已完成并释放款项？';

    const that = this;
    wx.showModal({
        title: '提示',
        content: confirmContent,
        success(res) {
            if (res.confirm) {
                that.executeHandshake(subAction);
            }
        }
    });
  },

  async executeHandshake(subAction) {
      wx.showLoading({ title: '处理中' });
      try {
          // Use lesson ID if available, otherwise fallback to index + 1
          const lessonId = (this.data.lesson && this.data.lesson.lesson) 
              ? this.data.lesson.lesson 
              : (this.data.lessonIndex + 1);
          
          const res = await wx.cloud.callFunction({
              name: 'execution_order',
              data: {
                  action: 'lesson_handshake',
                  orderId: this.data.orderId,
                  lessonIndex: lessonId,
                  subAction: subAction
              }
          });

          wx.hideLoading();
          if (res.result.code === 0) {
              wx.showToast({ title: '操作成功' });
              this.refreshLessonData();
          } else {
              console.error('[progress_classdetailed] [executeHandshake] Error:', res.result);
              wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
          }
      } catch (err) {
          wx.hideLoading();
          console.error('[progress_classdetailed] [executeHandshake] Network error', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
      }
  },

  /**
   * Send Payment Order (Coach initiates)
   */
  async handleSendOrder() {
      // Use lesson ID if available, otherwise fallback to index + 1
      const lessonId = (this.data.lesson && this.data.lesson.lesson) 
          ? this.data.lesson.lesson 
          : (this.data.lessonIndex + 1);

      console.log('[progress_classdetailed] [handleSendOrder] Initiating send order', {
          orderId: this.data.orderId,
          lessonIndex: this.data.lessonIndex,
          lessonId: lessonId,
          lessonData: this.data.lesson
      });

      wx.showModal({
          title: '提示',
          content: '确认发起支付单？家长将收到支付提示。',
          success: async (res) => {
              if (res.confirm) {
                  wx.showLoading({ title: '发送中' });
                  try {
                      const res = await wx.cloud.callFunction({
                          name: 'execution_order',
                          data: {
                              action: 'send_lesson_order', 
                              orderId: this.data.orderId,
                              lessonIndex: lessonId
                          }
                      });
                      wx.hideLoading();
                      if (res.result.code === 0) {
                          wx.showToast({ title: '已发送' });
                          this.refreshLessonData();
                      } else {
                          console.error('[progress_classdetailed] [handleSendOrder] Cloud function error:', res.result);
                          wx.showToast({ title: res.result.msg || '失败', icon: 'none' });
                      }
                  } catch (err) {
                      wx.hideLoading();
                      console.error('[progress_classdetailed] [handleSendOrder] Network error:', err);
                      wx.showToast({ title: '网络错误', icon: 'none' });
                  }
              }
          }
      });
  },

  /**
   * Handle Payment (Parent)
   */
  async handlePayOrder() {
      wx.showLoading({ title: '准备支付' });
      const lessonId = (this.data.lesson && this.data.lesson.lesson) 
          ? this.data.lesson.lesson 
          : (this.data.lessonIndex + 1);

      try {
          const res = await wx.cloud.callFunction({
              name: 'execution_order',
              data: {
                  action: 'get_payment_params',
                  orderId: this.data.orderId,
                  lessonIndex: lessonId
              }
          });

          wx.hideLoading();
          if (res.result.code === 0) {
              const { payment, mock } = res.result;
              
              if (mock) {
                  // Mock payment flow
                  wx.showModal({
                      title: '模拟支付',
                      content: '当前为模拟支付模式，点击确定完成支付',
                      success: async (res) => {
                          if (res.confirm) {
                             await this.completePayment();
                          }
                      }
                  });
              } else {
                  // Real WeChat Pay
                  wx.requestPayment({
                      ...payment,
                      success: () => {
                          wx.showToast({ title: '支付成功' });
                          // In real flow, cloud function callback updates DB. 
                          // We refresh to see status change.
                          setTimeout(() => {
                              this.refreshLessonData();
                          }, 1500); 
                      },
                      fail: (err) => {
                          console.error('[progress_classdetailed] [handlePayOrder] Pay fail:', err);
                          if (err.errMsg.indexOf('cancel') === -1) {
                              wx.showToast({ title: '支付失败', icon: 'none' });
                          }
                      }
                  });
              }
          } else {
              console.error('[progress_classdetailed] [handlePayOrder] Get params fail:', res.result);
              wx.showToast({ title: res.result.msg || '获取支付参数失败', icon: 'none' });
          }
      } catch (err) {
          wx.hideLoading();
          console.error('[progress_classdetailed] [handlePayOrder] Error:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
      }
  },

  async completePayment() {
      wx.showLoading({ title: '支付处理中' });
      const lessonId = (this.data.lesson && this.data.lesson.lesson) 
          ? this.data.lesson.lesson 
          : (this.data.lessonIndex + 1);

      try {
          const res = await wx.cloud.callFunction({
              name: 'execution_order',
              data: {
                  action: 'pay_lesson',
                  orderId: this.data.orderId,
                  lessonIndex: lessonId
              }
          });
          wx.hideLoading();
          if (res.result.code === 0) {
              wx.showToast({ title: '支付成功' });
              this.refreshLessonData();
          } else {
              console.error('[progress_classdetailed] [completePayment] Error:', res.result);
              wx.showToast({ title: res.result.msg || '支付失败', icon: 'none' });
          }
      } catch (err) {
          wx.hideLoading();
          console.error('[progress_classdetailed] [completePayment] Network error:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
      }
  },

  /**
   * Upload Media (Coach)
   */
  handleUploadMedia() {
      const that = this;
      wx.chooseMedia({
          count: 9,
          mediaType: ['image', 'video'],
          sourceType: ['album', 'camera'],
          success(res) {
              const tempFiles = res.tempFiles;
              that.uploadFiles(tempFiles);
          }
      });
  },

  async uploadFiles(files) {
      wx.showLoading({ title: '上传中' });
      const uploads = files.map(file => {
          const ext = file.tempFilePath.split('.').pop();
          const cloudPath = `lesson_media/${this.data.orderId}_${this.data.lessonIndex}_${Date.now()}_${Math.random().toString(36).slice(-6)}.${ext}`;
          return wx.cloud.uploadFile({
              cloudPath,
              filePath: file.tempFilePath
          });
      });

      try {
          const results = await Promise.all(uploads);
          const newFileIDs = results.map(r => r.fileID);
          const currentMedia = this.data.mediaList || [];
          const updatedMedia = currentMedia.concat(newFileIDs);

          // Update DB
          await this.updateLessonContent({ media: updatedMedia });
          
          this.setData({ mediaList: updatedMedia });
          wx.hideLoading();
          wx.showToast({ title: '上传成功' });
      } catch (err) {
          wx.hideLoading();
          console.error('上传失败', err);
          wx.showToast({ title: '上传失败', icon: 'none' });
      }
  },

  /**
   * Preview Media
   */
  previewMedia(e) {
      const current = e.currentTarget.dataset.url;
      const urls = this.data.mediaList;
      wx.previewImage({
          current,
          urls
      });
  },

  /**
   * Summary Operations
   */
  openSummaryModal() {
      this.setData({ showSummaryModal: true });
  },

  closeSummaryModal() {
      this.setData({ showSummaryModal: false });
  },

  handleSummaryInput(e) {
      this.setData({ summaryInput: e.detail.value });
  },

  async saveSummary() {
      wx.showLoading({ title: '保存中' });
      try {
          await this.updateLessonContent({ summary: this.data.summaryInput });
          wx.hideLoading();
          wx.showToast({ title: '保存成功' });
          this.closeSummaryModal();
          
          // Local update
          const lesson = this.data.lesson;
          lesson.summary = this.data.summaryInput;
          this.setData({ lesson });
          
      } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '保存失败', icon: 'none' });
      }
  },

  /**
   * Common update function
   */
  async updateLessonContent(content) {
      // Use lesson ID if available, otherwise fallback to index + 1
      const lessonId = (this.data.lesson && this.data.lesson.lesson) 
          ? this.data.lesson.lesson 
          : (this.data.lessonIndex + 1);

      const res = await wx.cloud.callFunction({
          name: 'execution_order',
          data: {
              action: 'update_lesson_content',
              orderId: this.data.orderId,
              lessonIndex: lessonId,
              content: content
          }
      });
      
      if (res.result && res.result.code !== 0) {
          console.error('[progress_classdetailed] [updateLessonContent] Failed:', res.result);
          throw new Error(res.result.msg || 'Update failed');
      }
      
      return res;
  }
});