const app = getApp();

Page({
  data: {
    conversationId: '',
    targetUserId: '',
    messages: [],
    targetUser: null,
    type: 'private',
    
    inputText: '',
    showEmojis: false,
    showFunctions: false,
    showActionMenu: false,
    emojis: ['😀','😁','😂','😅','😍','😎'],
    scrollTop: 0,
    userId: '',
    
    order: {},
    hasInitWelcome: false,
    
    // Negotiation Form Data
    showNegotiationForm: false,
    formPrice: '',
    formCount: '',
    formInstructions: ''
  },

  onLoad(options) {
    // Support both targetUserId and target_id (from different navigation sources)
    const targetUserId = options.targetUserId || options.target_id || '';
    const conversationId = options.conversationId || '';
    const type = options.type || 'private';
    
    const userId = app.globalData.token || ''; // Assuming token is openid or userId

    this.setData({ 
      conversationId, 
      targetUserId,
      userId,
      type
    });

    console.log('[私聊详情] 页面加载, 参数:', { conversationId, targetUserId, userId, type });

    // Initial load
    if (this.data.type !== 'group') {
      this.fetchConversationInfo();
    } else {
      // For group, conversationId IS orderId
      this.fetchOrderDetails();
    }
    this.fetchMessages();

    // Polling for new messages
    this.messageInterval = setInterval(() => {
      this.fetchMessages(true); // silent update
      if (this.data.type === 'group') {
          this.fetchOrderDetails(true); // Poll order status
      }
    }, 3000);
  },

  onUnload() {
    console.log('[私聊详情] 页面卸载, 清理定时器');
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
    }
  },

  // Fetch conversation/target user info
  fetchOrderDetails(silent = false) {
    if (!silent) console.log('[私聊详情] 获取订单详情...');
    wx.cloud.callFunction({
        name: 'execution_order',
        data: {
            action: 'get_oneorder',
            orderId: this.data.conversationId
        }
    }).then(res => {
        if (res.result.code === 0) {
            const order = res.result.data;
            
            this.setData({
                order,
                // Update title if needed
                targetUser: { nickname: order.title || '拼课群聊' } 
            });
        }
    }).catch(err => {
        if (!silent) console.error('[私聊详情] 获取订单失败', err);
    });
  },

  fetchConversationInfo() {
    console.log('[私聊详情] 开始获取会话信息...');
    wx.cloud.callFunction({
      name: 'pdd_chat_massage',
      data: {
        action: 'get_private_chat_info',
        conversationId: this.data.conversationId,
        targetUserId: this.data.targetUserId
      },
      success: res => {
        console.log('[私聊详情] 会话信息获取成功:', res);
        if (res.result.code === 0) {
          this.setData({
            targetUser: res.result.data.targetUser
          });
        }
      },
      fail: err => {
        console.error('[私聊详情] 会话信息获取失败:', err);
      }
    });
  },

  // Fetch messages
  fetchMessages(silent = false) {
    if (!silent) console.log('[私聊详情] 开始拉取消息列表...');
    
    const action = this.data.type === 'group' ? 'get_negotiation_msgs' : 'get_private_chat_msgs';
    
    wx.cloud.callFunction({
      name: 'pdd_chat_massage',
      data: {
        action: action,
        conversationId: this.data.conversationId
      },
      success: res => {
        if (res.result.code === 0) {
          const serverMsgs = res.result.data || [];
          if (!silent) console.log(`[私聊详情] 拉取消息成功, 共 ${serverMsgs.length} 条`);
          if (this.data.type === 'group' && !this.data.hasInitWelcome && serverMsgs.length === 0) {
            this.setData({ hasInitWelcome: true }, () => {
              this.sendGroupWelcomeMessage();
            });
          }
          const currentMsgs = this.data.messages;

          // Merge logic: avoid duplicates if we have local temp messages
          // In this simple version, we just replace or append if new
          // But to keep it smooth, we might want to check for diffs.
          // For now, let's just use the server list but try to preserve local pending ones if any.
          
          // Simple approach: Use server messages + local pending (if not in server)
          // Identifying local pending by temporary ID or lack of server ID?
          // The previous code had complex merge logic. Let's simplify:
          // Just use server messages. If we want optimistic UI, we can handle it in sendMessage.
          
          // Mark messages as fromSelf and add time display
          const processedMsgs = this.processMessages(serverMsgs);

          // Check if we need to scroll to bottom (only if new messages arrived)
          const shouldScroll = processedMsgs.length > currentMsgs.length;

          this.setData({ messages: processedMsgs }, () => {
            if (shouldScroll && !silent) {
              console.log('[私聊详情] 收到新消息, 滚动到底部');
              this.scrollToBottom();
            } else if (shouldScroll && silent) {
              // Maybe scroll if user is already at bottom?
              // For now, just scroll.
              this.scrollToBottom();
            }
          });
        }
      },
      fail: err => {
        if (!silent) console.error('[私聊详情] 拉取消息失败:', err);
      }
    });
  },

  sendGroupWelcomeMessage() {
    const order = this.data.order || {};
    const title = order.title || '拼课群聊';
    const content = `[系统通知] 欢迎来到「${title}」群聊！\n这里是课程协商群，大家可以在这里交流上课时间、地点等细节～`;
    wx.cloud.callFunction({
      name: 'pdd_chat_massage',
      data: {
        action: 'send_negotiation_msg',
        conversationId: this.data.conversationId,
        content: content,
        contentType: 'text',
        targetUserId: ''
      }
    }).then(() => {
      this.fetchMessages(true);
    }).catch(err => {
      console.error('[私聊详情] 群聊欢迎消息发送失败:', err);
    });
  },

  processMessages(msgs) {
    // Ensure sorted by time
    msgs.sort((a, b) => a.createdAt - b.createdAt);
    
    let lastTime = 0;
    return msgs.map(msg => {
      const msgTime = msg.createdAt;
      let showTime = false;
      let timeText = '';
      
      // Show time if diff > 5 mins (300000ms)
      if (msgTime - lastTime > 300000) {
        showTime = true;
        const date = new Date(msgTime);
        // Format: HH:mm
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        
        // Check if different day
        const now = new Date();
        const isToday = date.getDate() === now.getDate() && 
                        date.getMonth() === now.getMonth() && 
                        date.getFullYear() === now.getFullYear();
                        
        if (isToday) {
           timeText = `${hours}:${minutes}`;
        } else {
           const month = date.getMonth() + 1;
           const day = date.getDate();
           timeText = `${month}/${day} ${hours}:${minutes}`;
        }
      }
      
      if (showTime) lastTime = msgTime;
      
      return {
        ...msg,
        fromSelf: msg.senderOpenid === this.data.userId || msg.fromSelf,
        showTime,
        timeText
      };
    });
  },

  scrollToBottom() {
    const query = wx.createSelectorQuery();
    query.select('.chat-container').boundingClientRect(rect => {
      if (rect) {
        this.setData({
          scrollTop: rect.height * 1000 
        });
      }
    }).exec();
  },

  // UI Events
  goBack() {
    console.log('[私聊详情] 用户点击返回');
    wx.navigateBack();
  },

  showMoreActions() {
    const isGroup = this.data.type === 'group';
    const order = this.data.order || {};
    // Check if current user is the coach (acceptor) or has permission
    // Assuming userId is openid or matches acceptorId
    const isCoach = isGroup && (
        (order.acceptorOpenid && order.acceptorOpenid === this.data.userId) || 
        (order.acceptorId && order.acceptorId === this.data.userId)
    );
    
    const itemList = ['清空记录', '举报用户'];
    if (isCoach) {
        itemList.unshift('完成协商 (生成订单)');
    }

    wx.showActionSheet({
      itemList: itemList,
      success: res => {
        const tapIndex = res.tapIndex;
        const selected = itemList[tapIndex];
        
        if (selected === '完成协商 (生成订单)') {
            this.openNegotiationForm();
        } else if (selected === '清空记录') {
            this.clearHistory();
        } else if (selected === '举报用户') {
            this.reportUser();
        }
      },
      fail: (err) => {
        console.log(err.errMsg)
      }
    });
  },

  // Negotiation Form Logic
  openNegotiationForm() {
    this.setData({
        showNegotiationForm: true,
        // Pre-fill with reasonable defaults if available
        formPrice: this.data.order.price || '',
        formCount: this.data.order.participant_count || 10,
        formInstructions: ''
    });
  },

  closeNegotiationForm() {
    this.setData({ showNegotiationForm: false });
  },

  onFormClose() {
    // Triggered by page-container internal close event
    this.setData({ showNegotiationForm: false });
  },

  submitNegotiation() {
    const price = parseFloat(this.data.formPrice);
    const count = parseInt(this.data.formCount);
    const instructions = this.data.formInstructions.trim();

    if (isNaN(price) || price <= 0) {
        wx.showToast({ title: '请输入有效单价', icon: 'none' });
        return;
    }
    if (isNaN(count) || count <= 0) {
        wx.showToast({ title: '请输入有效课节数', icon: 'none' });
        return;
    }

    wx.showLoading({ title: '提交中...' });

    wx.cloud.callFunction({
        name: 'execution_order',
        data: {
            action: 'complete_negotiation',
            orderId: this.data.conversationId,
            price: price,
            count: count,
            instructions: instructions
        }
    }).then(res => {
        wx.hideLoading();
        if (res.result.code === 0) {
            wx.showToast({ title: '提交成功', icon: 'success' });
            this.setData({ showNegotiationForm: false });
            // Refresh order status
            this.fetchOrderDetails();
            // Send a system message to chat
            this.sendNegotiationCompleteMsg(price, count);
        } else {
            wx.showModal({ title: '提交失败', content: res.result.msg, showCancel: false });
        }
    }).catch(err => {
        wx.hideLoading();
        console.error('Submit negotiation error:', err);
        wx.showModal({ title: '系统错误', content: err.errMsg || '未知错误', showCancel: false });
    });
  },

  sendNegotiationCompleteMsg(price, count) {
      const content = `[系统通知] 教练已完成协商并生成订单。\n单节费用：${price}元\n总课节数：${count}节\n请家长确认并支付。`;
      wx.cloud.callFunction({
          name: 'pdd_chat_massage',
          data: {
              action: 'send_negotiation_msg',
              conversationId: this.data.conversationId,
              content: content,
              contentType: 'text'
          }
      }).then(() => this.fetchMessages(true));
  },

  hideActionMenu() {
    this.setData({ showActionMenu: false });
  },

  toggleEmoji() {
    this.setData({
      showEmojis: !this.data.showEmojis,
      showFunctions: false
    });
  },

  showMoreFunctions() {
    this.setData({
      showFunctions: !this.data.showFunctions,
      showEmojis: false
    });
  },

  onInputChange(e) {
    this.setData({
      inputText: e.detail.value
    });
  },

  selectEmoji(e) {
    this.setData({
      inputText: this.data.inputText + e.currentTarget.dataset.emoji
    });
  },

  // Send Message
  sendMessage() {
    const content = this.data.inputText.trim();
    if (!content) return;

    console.log('[私聊详情] 用户发送消息:', content);

    // Optimistic update
    const tempMsg = {
      _id: 'temp_' + Date.now(),
      fromSelf: true,
      contentType: 'text',
      content,
      createdAt: new Date().getTime(),
      senderOpenid: this.data.userId
    };

    const newMessages = [...this.data.messages, tempMsg];
    this.setData({
      messages: newMessages,
      inputText: ''
    }, () => {
      this.scrollToBottom();
    });

    // Call Cloud Function
    console.log('[私聊详情] 调用云函数发送消息...');
    
    const action = this.data.type === 'group' ? 'send_negotiation_msg' : 'send_private_msg';

    wx.cloud.callFunction({
      name: 'pdd_chat_massage',
      data: {
        action: action,
        conversationId: this.data.conversationId,
        content: content,
        contentType: 'text',
        targetUserId: this.data.targetUserId
      },
      success: res => {
        console.log('[私聊详情] 发送消息结果:', res);
        if (res.result.code === 0) {
          // Message sent successfully.
          // The interval will fetch the real message with server ID.
          // We could replace the temp message here if we returned the new ID, 
          // but relying on fetchMessages is easier for consistency.
          this.fetchMessages(true);
        } else {
          console.error('[私聊详情] 发送消息业务失败:', res.result.msg);
          wx.showToast({ title: '发送失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('[私聊详情] 发送消息调用失败:', err);
        wx.showToast({ title: '发送出错', icon: 'none' });
      }
    });
  },

  // Other functions
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    console.log('[私聊详情] 预览图片:', url);
    wx.previewImage({
      urls: [url]
    });
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      success: res => {
        // Upload image then send message... 
        // For now just log
        console.log('[私聊详情] 选择图片成功:', res.tempFilePaths);
        wx.showToast({ title: '图片发送功能待完善', icon: 'none' });
      }
    });
  },

  takePhoto() {
    wx.chooseImage({
      sourceType: ['camera'],
      success: res => {
        console.log('[私聊详情] 拍照成功:', res.tempFilePaths);
      }
    });
  },

  sendVoice() {
    console.log('[私聊详情] 点击发送语音');
    wx.showToast({ title: '语音功能待实现', icon: 'none' });
  },

  sendLocation() {
    console.log('[私聊详情] 点击发送位置');
    wx.getLocation({
      success: res => {
        console.log('[私聊详情] 获取位置成功:', res);
      }
    });
  },

  clearHistory() {
    console.log('[私聊详情] 清空聊天记录');
    this.setData({ messages: [], showActionMenu: false });
  },

  blockUser() {
    console.log('[私聊详情] 屏蔽用户');
    wx.showToast({ title: '已屏蔽', icon: 'none' });
  },

  reportUser() {
    console.log('[私聊详情] 举报用户');
    wx.showToast({ title: '已举报', icon: 'none' });
  }
});
