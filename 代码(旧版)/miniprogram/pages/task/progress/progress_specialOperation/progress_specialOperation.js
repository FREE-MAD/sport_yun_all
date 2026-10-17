// pages/task/progress/progress_specialOperation/progress_specialOperation.js
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    statusBarHeight: 0,
    orderId: '',
    order: {
      title: '加载中...',
      intention: '',
      status: '',
      location: '',
      deadline: '',
      price: '',
      schedule: [],
      participants: [],
      publisher_openid: '',
      publish_state: '',
      fulfill_state: '',
      isJoined: false
    },
    messages: [],
    schedule: [],
    isCoach: false, // 是否为该订单的执行教练 (Acceptor)
    isRoleCoach: false, // 当前用户身份是否为教练 (Role)
    isOwner: false, // 是否为发布者
    currentUserOpenid: '',
    userState: 'not_joined', // not_joined, joined, locked_pre, locked_post
    statusText: '加载中...',
    actionBtnText: '加载中...',
    actionBtnClass: 'btn-disable',
    showIntentions: false,
    showParticipants: true, // 新增：控制家长列表展开/收起，默认展开
    showIntentionModal: false,
    intentionForm: {
      time: '',
      coachRequirements: '',
      childCount: 1,
      contact: ''
    },
    deadlineDisplay: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 获取状态栏高度
    const { statusBarHeight } = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    
    // 获取用户信息
    const user = {
        openid: app.globalData.openid || wx.getStorageSync('openid'),
        userId: wx.getStorageSync('token')
    };

    const role = options.role || app.globalData.userRole || '';
    const isRoleCoach = role === 'C';

    this.setData({ 
        statusBarHeight,
        user,
        isRoleCoach
    });

    // 不再读取本地意向内容缓存，避免跨订单数据污染
    // 依赖 fetchOrderDetails 获取的 userState 判断是否已加入

    if (options.id) {
      console.log(`[progress_specialOperation] [onLoad] 接收到参数 id: ${options.id}`);
      this.setData({ orderId: options.id });
      this.fetchOrderDetails(options.id);
    } else {
      console.warn('[progress_specialOperation] [onLoad] 参数错误: 缺少 id');
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
    }
  },

  /**
   * 获取订单详情 (改用 execution_order 获取全生命周期数据)
   */
  fetchOrderDetails(orderId) {
    console.log(`[progress_specialOperation] [fetchOrderDetails] 开始获取详情: ${orderId}`);
    wx.showLoading({ title: '加载中' });
    const token = wx.getStorageSync('token');
    
    return wx.cloud.callFunction({
      name: 'execution_order', // 统一使用 execution_order
      data: {
        action: 'get_oneorder',
        orderId: orderId
      }
    }).then(res => {
      wx.hideLoading();
      wx.stopPullDownRefresh();
      if (res.result.code === 0) {
        console.log(`[progress_specialOperation] [fetchOrderDetails] 获取成功`);
        const orderData = res.result.data;
        
        // 本地计算 userState
        const userState = this.calculateUserState(orderData, token);
        const myOpenid = app.globalData.openid || '';
        const isOwner = orderData.publisher_openid === myOpenid || orderData.publisher_Id === token;
        // 判定是否为该订单的接单教练 (Acceptor)
        const isAcceptor = orderData.acceptorOpenid === myOpenid || orderData.acceptorId === token;

        // 解析教练意向数据
        const willingCoach = orderData.Willing_coach || { willing: [], unwilling: [] };
        const willingList = willingCoach.willing || [];
        const unwillingList = willingCoach.unwilling || [];

        // 默认将发布者算作一个意向 (如果尚未加入)
        if (isOwner) {
            const participants = orderData.participants || [];
            const isJoined = participants.some(p => p.openid === myOpenid || p.userId === token);
            if (!isJoined) {
                 // 构造发布者意向信息
                 const publisherInfo = {
                     openid: myOpenid,
                     userId: token,
                     userInfo: app.globalData.userInfo || { nickName: '我', avatarUrl: '' },
                     status: 'confirmed', // 发布者默认为已确认/加入
                     intention: { childCount: 1 }, // 默认为1
                     isPublisher: true
                 };
                 // 插入到列表头部
                 if (!orderData.participants) orderData.participants = [];
                 orderData.participants.unshift(publisherInfo);
                 console.log('[progress_specialOperation] 自动添加发布者到意向列表');
            }
        }

        let deadlineDisplay = '';
        try {
          const now = new Date();
          let deadlineDate = null;

          if (orderData.deadlineTime) {
            deadlineDate = new Date(orderData.deadlineTime);
          } else if (orderData.deadline && !isNaN(new Date(orderData.deadline))) {
            deadlineDate = new Date(orderData.deadline);
          } else if (orderData.createdAt) {
            const createdDate = new Date(orderData.createdAt);
            if (!isNaN(createdDate.getTime())) {
              deadlineDate = new Date(createdDate.getTime() + 72 * 60 * 60 * 1000);
            }
          }

          if (deadlineDate && !isNaN(deadlineDate.getTime())) {
            const diffMs = deadlineDate.getTime() - now.getTime();
            const month = (deadlineDate.getMonth() + 1).toString().padStart(2, '0');
            const day = deadlineDate.getDate().toString().padStart(2, '0');
            const hour = deadlineDate.getHours().toString().padStart(2, '0');
            const minute = deadlineDate.getMinutes().toString().padStart(2, '0');
            const timeStr = `${month}月${day}日 ${hour}:${minute}`;

            if (diffMs <= 0) {
              deadlineDisplay = `已截止 ${timeStr}`;
            } else {
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays > 0) {
                deadlineDisplay = `${diffDays}天后 ${timeStr}`;
              } else {
                deadlineDisplay = `今天 ${timeStr}`;
              }
            }
          }
        } catch (e) {
          deadlineDisplay = '';
        }

        console.log(`[progress_specialOperation] [fetchOrderDetails] 计算用户状态: ${userState}, 订单状态: ${orderData.publish_state}, isOwner: ${isOwner}`);

        this.setData({
          order: orderData,
          schedule: orderData.schedule || [],
          willingList,
          unwillingList,
          userState: userState,
          isCoach: isAcceptor, // 修正: 仅当是接单人时为 true
          isOwner: isOwner, 
          currentUserOpenid: myOpenid,
          deadlineDisplay,
          currentPhase: orderData.current_phase || 'coach_open' // 默认为开放
        });
        
        // 计算当前应当显示的课程
        this.computeCurrentLesson(orderData.schedule);

        // 使用 publish_state 和 fulfill_state 来更新发布者的UI
        this.updateUIByState(orderData.publish_state, orderData.fulfill_state, isOwner);
      } else {
        console.error(`[progress_specialOperation] [fetchOrderDetails] 获取失败: ${res.result.msg}`);
        wx.showToast({
          title: res.result.msg || '加载失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.stopPullDownRefresh();
      console.error('[progress_specialOperation] [fetchOrderDetails] 网络错误:', err);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    });
  },

  /**
   * 计算用户状态
   */
  calculateUserState(order, token) {
     // 优先使用后端返回的 isJoined 字段
     if (order.isJoined === true) {
         if (order.publish_state === 'nearby_group' || order.publish_state === 'public_view') return 'joined';
         if (order.publish_state === 'locked_pre') return 'locked_pre';
         if (order.publish_state === 'locked_post') return 'locked_post';
         return 'joined';
     }

     // 后备逻辑 (如果后端未返回 isJoined)
     const participants = order.participants || [];
     // 尝试从 globalData 获取 openid，因为 token 可能是 uuid
    const myOpenid = app.globalData.openid || ''; 
    // 判定是否为发布者
    const isOwner = order.publisher_openid === myOpenid || order.publisher_Id === token;
    
    const isJoined = isOwner || participants.some(p => p.openid === myOpenid || p.userId === token);
    
    if (!isJoined) return 'not_joined';
     
     // 已加入，根据订单状态返回
     if (order.publish_state === 'nearby_group' || order.publish_state === 'public_view') return 'joined';
     if (order.publish_state === 'locked_pre') return 'locked_pre';
     if (order.publish_state === 'locked_post') return 'locked_post';
     
     return 'joined';
  },

  /**
   * 计算当前应当显示的课程 (只显示一个)
   */
  computeCurrentLesson(schedule) {
    if (!schedule || schedule.length === 0) {
        this.setData({ currentLesson: null, currentLessonIndex: -1 });
        return;
    }

    // 找到第一个未完成的课程 (状态不是 DONE 或 COMPLETED_BY_COACH)
    // 注意: COMPLETED_BY_COACH 是教练点结束，家长还没确认，这时候应该还显示它供家长确认
    // 只有 DONE (家长确认下课) 才算彻底完成，进入下一节
    // 用户需求: "当上一个完成之后自动生成下一个" -> DONE 之后切下一个
    
    let index = schedule.findIndex(item => item.status !== 'DONE');
    
    // 如果全部完成了，显示最后一个
    if (index === -1) {
        index = schedule.length - 1;
    }

    this.setData({
        currentLesson: schedule[index],
        currentLessonIndex: index
    });
  },

  /**
   * 跳转到课程详情页
   */
  handleToClassDetail(e) {
    const index = (e && e.currentTarget.dataset.index !== undefined) ? e.currentTarget.dataset.index : this.data.currentLessonIndex;
    const lesson = this.data.schedule[index];
    
    if (!lesson) return;

    const lessonStr = encodeURIComponent(JSON.stringify(lesson));
    const orderId = this.data.orderId;
    const isCoach = this.data.isCoach;
    const isRoleCoach = this.data.isRoleCoach;
    const isOwner = this.data.isOwner;
    
    wx.navigateTo({
      url: `/pages/task/progress/progress_specialOperation/progress_classdetailed/progress_classdetailed?lesson=${lessonStr}&index=${index}&orderId=${orderId}&isCoach=${isCoach}&isRoleCoach=${isRoleCoach}&isOwner=${isOwner}`
    });
  },

  /**
   * 手动添加课节 (仅教练)
   */
  handleAddLesson() {
    if (!this.data.isCoach) return;

    wx.showModal({
      title: '添加课节',
      content: '确认要添加一个新的课节吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '添加中' });
          try {
            const result = await wx.cloud.callFunction({
              name: 'execution_order',
              data: {
                action: 'add_lesson',
                orderId: this.data.orderId
              }
            });

            if (result.result.code === 0) {
              wx.showToast({ title: '添加成功', icon: 'success' });
              this.fetchOrderDetails(this.data.orderId); // 刷新数据
            } else {
              throw new Error(result.result.msg);
            }
          } catch (err) {
            console.error('[handleAddLesson] 失败:', err);
            wx.showToast({ title: '添加失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  /**
   * 更新UI状态
   */
  updateUIByState(publishState, fulfillState, isOwner) {
    // 如果没有传入 isOwner，尝试从 data 获取
    if (isOwner === undefined) isOwner = this.data.isOwner;

    let statusText = '';
    let actionBtnText = '';
    let actionBtnClass = '';
    let currentStep = 0;

    // 优先处理 fulfill_state (执行阶段)
    if (this.data.schedule && this.data.schedule.length > 0) {
        currentStep = 3; // 只要有课表，就是开课状态
        if (fulfillState !== 'completed' && fulfillState !== 'cancelled') {
             statusText = '课程已生成课表，请按课表进行上课';
             actionBtnText = '进行中';
             actionBtnClass = 'btn-disable';
        }
    }
    
    if (fulfillState === 'in_progress') {
        statusText = '课程正在进行中，请查看下方课表并完成打卡';
        actionBtnText = '进行中';
        actionBtnClass = 'btn-disable'; // 按钮本身禁用，操作在课表里
        currentStep = 3; // 开课
    } else if (fulfillState === 'completed' || fulfillState === 'p_completed') {
        statusText = '课程已全部完成';
        actionBtnText = '已完成';
        actionBtnClass = 'btn-disable';
        currentStep = 3;
    } else if (fulfillState === 'cancelled') {
        statusText = '课程已取消';
        actionBtnText = '已取消';
        actionBtnClass = 'btn-disable';
        currentStep = 3;
    } else if (fulfillState === 'pending' && (publishState === 'locked_post' || publishState === 'locked_pre')) {
        // 只有在 locked 之后，pending 才意味着“等待开始”
        statusText = '课程准备中，等待开始';
        actionBtnText = '等待开始';
        actionBtnClass = 'btn-disable';
        currentStep = 2;
    } else {
        // 处理 publish_state
        switch (publishState) {
            case 'not_joined':
                statusText = '您尚未参与此课程，点击下方按钮表达意向';
                actionBtnText = '我有意向';
                actionBtnClass = 'btn-primary';
                currentStep = 0; // 发布
                break;
            case 'joined': // 用户已加入，但在协商中
            case 'nearby_group': // 订单状态
            case 'public_view':
                // 只有 owner 能锁班
                statusText = '当前正在招募队友，人数足够后可申请锁班';
                if (isOwner) {
                    actionBtnText = '锁定课程';
                    actionBtnClass = 'btn-primary';
                } else {
                    actionBtnText = '等待锁班';
                    actionBtnClass = 'btn-disable';
                }
                currentStep = 1; // 凑单
                break;
            case 'locked_pre':
                statusText = '课程已申请锁定，正在等待最终确认';
                if (isOwner) {
                    actionBtnText = '确认成团';
                    actionBtnClass = 'btn-primary';
                } else {
                    actionBtnText = '等待确认';
                    actionBtnClass = 'btn-disable';
                }
                currentStep = 2; // 锁班
                break;
            case 'locked_post':
                statusText = '课程已确认成团，准备开课';
                if (isOwner) {
                    actionBtnText = '开始课程'; 
                    actionBtnClass = 'btn-primary';
                } else {
                    actionBtnText = '等待开课';
                    actionBtnClass = 'btn-disable';
                }
                currentStep = 3; // 开课
                break;
            case 'closed':
                statusText = '课程已关闭';
                actionBtnText = '已关闭';
                actionBtnClass = 'btn-disable';
                currentStep = 3;
                break;
            default:
                // 默认状态处理
                if (this.data.userState === 'not_joined') {
                    statusText = '您尚未参与此课程，点击下方按钮表达意向';
                    actionBtnText = '我有意向';
                    actionBtnClass = 'btn-primary';
                    currentStep = 0;
                } else {
                    statusText = '状态未知';
                    actionBtnText = '未知状态';
                    actionBtnClass = 'btn-disable';
                    currentStep = 0;
                }
        }
    }

    this.setData({
      statusText,
      actionBtnText,
      actionBtnClass,
      currentStep
    });
  },

  // 展开/收起意愿列表
  toggleIntentions() {
    this.setData({
      showIntentions: !this.data.showIntentions
    });
  },

  // 展开/收起家长列表
  toggleParticipants() {
    this.setData({
      showParticipants: !this.data.showParticipants
    });
  },
  
  // 展开/收起教练意愿列表
  toggleCoachIntentions() {
      this.setData({
          showCoachIntentions: !this.data.showCoachIntentions
      });
  },

  /**
   * 打开意向填写弹窗
   */
  openIntentionModal() {
    // 不再检查本地缓存进行自动提交，避免跨订单问题
    this.setData({
      showIntentionModal: true
    });
  },

  /**
   * 关闭意向填写弹窗
   */
  closeIntentionModal() {
    this.setData({
      showIntentionModal: false
    });
  },

  /**
   * 防止弹窗内容点击冒泡关闭
   */
  preventBubble() {},

  /**
   * 处理意向表单输入
   */
  handleIntentionInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`intentionForm.${field}`]: value
    });
  },

  /**
   * 增加孩子数量
   */
  incrementChild() {
    this.setData({
      'intentionForm.childCount': this.data.intentionForm.childCount + 1
    });
  },

  /**
   * 减少孩子数量
   */
  decrementChild() {
    if (this.data.intentionForm.childCount > 1) {
      this.setData({
        'intentionForm.childCount': this.data.intentionForm.childCount - 1
      });
    }
  },

  /**
   * 发送机器人消息
   */
  async sendRobotMessage(content) {
    try {
      console.log('[progress_specialOperation] 发送机器人消息:', content);
      await wx.cloud.callFunction({
        name: 'pdd_chat_massage',
        data: {
          action: 'send_negotiation_msg',
          conversationId: this.data.orderId,
          content: content,
          contentType: 'text',
          targetUserId: ''
        }
      });
    } catch (err) {
      console.error('[progress_specialOperation] 机器人消息发送失败', err);
    }
  },

  /**
   * 提交意向 (加入拼团)
   * 调用 negotiation_parent 的 join 动作
   */
  submitIntention() {
    const { time, coachRequirements, childCount, contact } = this.data.intentionForm;
    
    if (!contact) {
      wx.showToast({ title: '请填写手机号', icon: 'none' });
      return;
    }
    
    /* 
    if (!time && !coachRequirements) {
      wx.showToast({ title: '请至少填写一项偏好', icon: 'none' });
      return;
    }
    */

    console.log('[progress_specialOperation] [submitIntention] 提交意向:', this.data.intentionForm);
    wx.showLoading({ title: '提交中' });
    
    // 1. 先提交加入请求
    wx.cloud.callFunction({
      name: 'negotiation_parent', 
      data: {
        action: 'join', 
        orderId: this.data.orderId,
        intention: { time, coachRequirements, childCount, contact }
      }
    }).then(async res => {
      if (res.result.code === 0) {
        console.log('[progress_specialOperation] [submitIntention] 提交成功');
        
        const order = this.data.order || {};
        const participants = order.participants || [];
        const currentCount = participants.length + 1;
        const deadlineDisplay = this.data.deadlineDisplay || '';
        const lockInfo = deadlineDisplay ? `距离锁班：${deadlineDisplay}` : '距离锁班：未设置';
        const coachJoinedText = order.acceptorId ? '已加入教练' : '暂未有教练加入';
        const rules = order.group_rules || '未填写';
        const childInfo = childCount ? `${childCount} 名` : '未填写';
        const coachReqInfo = coachRequirements || '无';
        
        const robotMsg =
          `[系统通知] 新成员加入拼单！` +
          `\n当前人数：${currentCount}人` +
          `\n${lockInfo}` +
          `\n教练状态：${coachJoinedText}` +
          `\n玩法规则：${rules}` +
          `\n本次填写：小朋友人数 ${childInfo}，教练要求：${coachReqInfo}，期望时间：${time || '无'}`;

        await this.sendRobotMessage(robotMsg);

        // 仅记录该订单已完成填写，不再缓存具体内容
        wx.setStorageSync(`intention_completed_${this.data.orderId}`, true);

        wx.hideLoading();
        wx.showToast({ title: '加入成功' });
        this.closeIntentionModal();
        this.fetchOrderDetails(this.data.orderId); // 刷新
        
        setTimeout(() => {
            wx.navigateTo({
                url: `/pages/private_talk/private_talk_detail/private_talk_detail?conversationId=${this.data.orderId}&type=group`
            });
        }, 1500);
      } else {
        wx.hideLoading();
        console.error(`[progress_specialOperation] [submitIntention] 提交失败: ${res.result.msg}`);
        wx.showToast({ title: res.result.msg || '提交失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('[progress_specialOperation] [submitIntention] 网络错误:', err);
      wx.showToast({ title: '提交失败', icon: 'none' });
    });
  },

  /**
   * 加入群聊/点击底部按钮
   */
  handleJoinGroupChat() {
    const orderId = this.data.orderId;
    if (!orderId) {
      console.warn('[progress_specialOperation] [handleJoinGroupChat] 缺少订单ID');
      wx.showToast({ title: '订单ID缺失', icon: 'none' });
      return;
    }

    const userState = this.data.userState;
    const isOwner = this.data.isOwner;
    const isCoach = this.data.isCoach; // isAcceptor
    const isRoleCoach = this.data.isRoleCoach;

    console.log(`[progress_specialOperation] [handleJoinGroupChat] 点击按钮, userState=${userState}, isOwner=${isOwner}, isCoach=${isCoach}, isRoleCoach=${isRoleCoach}`);
    
    // 如果已经加入 (包括已提交过意向) 或者是发布者，或者已确认的教练，或者是有角色的教练(查看模式)，直接跳转聊天
    if (userState !== 'not_joined' || isOwner || isCoach || isRoleCoach) {
      wx.navigateTo({
        url: `/pages/private_talk/private_talk_detail/private_talk_detail?conversationId=${orderId}&type=group`
      });
      return;
    }

    // 尝试读取本地状态作为兜底 (如果网络延迟导致 userState 还没更新)
    const isLocalCompleted = wx.getStorageSync(`intention_completed_${orderId}`);
    if (isLocalCompleted) {
        console.log('[progress_specialOperation] 检测到本地完成标记，直接跳转');
        wx.navigateTo({
            url: `/pages/private_talk/private_talk_detail/private_talk_detail?conversationId=${orderId}&type=group`
        });
        return;
    }

    // 只有真正的 not_joined 才弹窗
    this.openIntentionModal();
  },

  /**
   * 家长操作菜单
   */
  handleParentOperation() {
    const userState = this.data.userState;
    const orderState = this.data.order.publish_state;
    const fulfillState = this.data.order.fulfill_state;
    const itemList = [];
    const actionMap = {};

    // 1. 如果已取消，直接跳转重新发布
    if (fulfillState === 'cancelled') {
        wx.navigateTo({
            url: '/pages/task/publish/publish'
        });
        return;
    }

    // 根据状态构建可用操作列表
    if (userState === 'not_joined') {
      itemList.push('我有意向');
      actionMap['我有意向'] = () => this.openIntentionModal();
    } else if (orderState === 'nearby_group' || orderState === 'public_view') {
      // 协商中
      if (this.data.isOwner) {
        itemList.push('锁定课程');
        itemList.push('取消任务');
        actionMap['锁定课程'] = () => this.handleLockTask();
        actionMap['取消任务'] = () => this.handleCancelTask();
      } else {
        // itemList.push('退出拼单'); 
        // actionMap['退出拼单'] = () => wx.showToast({title: '暂不支持退出', icon:'none'});
      }
    } else if (orderState === 'locked_pre') {
      // 锁班确认中
      if (this.data.isOwner) {
        itemList.push('确认成团');
        itemList.push('取消任务');
        actionMap['确认成团'] = () => this.handleConfirmParents();
        actionMap['取消任务'] = () => this.handleCancelTask();
      }
    } else if (orderState === 'locked_post') {
      // 已成团
      if (this.data.isOwner) {
        itemList.push('开始课程');
        actionMap['开始课程'] = () => this.handleStartTask();
      }
    }

    if (itemList.length === 0) {
      wx.showToast({ title: '当前状态无可用操作', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        const tapIndex = res.tapIndex;
        const actionName = itemList[tapIndex];
        if (actionMap[actionName]) {
          actionMap[actionName]();
        }
      }
    });
  },

  handleSelectCoach(e) {
    const { openid, userid, nickname } = e.currentTarget.dataset;
    console.log('[progress_specialOperation] [handleSelectCoach] openid:', openid, 'userid:', userid);

    if (!openid || !userid) {
        wx.showToast({ title: '参数错误', icon: 'none' });
        return;
    }

    wx.showModal({
        title: '确认聘用',
        content: `确定要聘用教练 ${nickname || '此教练'} 吗？`,
        success: (res) => {
            if (res.confirm) {
                this.confirmCoach(openid, userid);
            }
        }
    });
  },

  /**
   * 执行聘用教练
   */
  confirmCoach(coachOpenid, coachUserId) {
    wx.showLoading({ title: '确认中...' });
    
    wx.cloud.callFunction({
        name: 'negotiation_CtoP',
        data: {
            action: 'parent_confirm',
            orderId: this.data.orderId,
            coachOpenid: coachOpenid,
            coachUserId: coachUserId
        }
    }).then(res => {
        wx.hideLoading();
        if (res.result.code === 0) {
            wx.showToast({ title: '聘用成功' });
            this.fetchOrderDetails(this.data.orderId);
        } else {
            wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
        }
    }).catch(err => {
        wx.hideLoading();
        console.error('[confirmCoach] error', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  /**
   * 卡片主操作按钮点击
   */
  handleAction() {
    const text = this.data.actionBtnText;
    if (text === '我有意向') {
      this.openIntentionModal();
    } else if (text === '锁定课程') {
      this.handleLockTask();
    } else if (text === '确认成团') {
      this.handleConfirmParents();
    } else if (text === '开始课程') {
      this.handleStartTask();
    } else if (text.startsWith('等待') || text.startsWith('已')) {
       // Do nothing or hint
    } else {
       // Fallback to sheet
       this.handleParentOperation();
    }
  },

  /**
   * 开始课程
   */
  handleStartTask() {
    if (!this.data.isOwner) {
        wx.showToast({ title: '无权操作', icon: 'none' });
        return;
    }
    this.performAction('start', '正在开始课程...', '[系统通知] 课程已开始，请各位家长按时参加！');
  },

  /**
   * 确认成团
   */
  handleConfirmParents() {
    if (!this.data.isOwner) {
        wx.showToast({ title: '无权操作', icon: 'none' });
        return;
    }
    this.performAction('confirm_group', '正在确认成团...', '[系统通知] 拼单已确认成团！');
  },

  /**
   * 锁定课程
   */
  handleLockTask() {
    if (!this.data.isOwner) {
        wx.showToast({ title: '无权操作', icon: 'none' });
        return;
    }
    if (!this.data.order.participants || this.data.order.participants.length === 0) {
        wx.showToast({ title: '暂无人加入，无法锁班', icon: 'none' });
        return;
    }
    // 注意：Action 变更为 lock_order
    this.performAction('lock_order', '正在锁班...', '[系统通知] 课程已锁定，等待最终确认。');
  },

  /**
   * 取消任务
   */
  handleCancelTask() {
    const reasons = ['行程改变', '拼单进度过慢', '无法联系参与者', '场地/天气原因', '其他原因'];
    
    wx.showActionSheet({
      itemList: reasons,
      success: (res) => {
        const reason = reasons[res.tapIndex];
        
        // 二次确认
        wx.showModal({
          title: '确认取消',
          content: `确定要取消任务吗？\n原因：${reason}`,
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.performAction('cancel', '正在取消...', `[系统通知] 拼单任务已取消。原因：${reason}`, { reason: reason });
            }
          }
        });
      }
    });
  },

  /**
   * 执行云函数动作 (统一使用 execution_order)
   */
  performAction(action, loadingText, robotMsg = '', extraData = {}) {
    console.log(`[progress_specialOperation] [performAction] 开始执行动作: ${action}, orderId=${this.data.orderId}`);
    wx.showLoading({ title: loadingText });
    const token = wx.getStorageSync('token');
    
    wx.cloud.callFunction({
      name: 'execution_order', // 统一使用 execution_order
      data: {
        action: action,
        orderId: this.data.orderId,
        userId: token, // 确保鉴权通过
        ...extraData
      }
    }).then(async res => {
      wx.hideLoading();
      if (res.result.code === 0) {
        console.log(`[progress_specialOperation] [performAction] 动作成功: ${action}`);
        wx.showToast({ title: '操作成功' });
        
        if (robotMsg) {
            await this.sendRobotMessage(robotMsg);
        }

        if (action === 'cancel') {
             setTimeout(() => {
                 wx.switchTab({
                     url: '/pages/index/index'
                 });
             }, 1500);
             return;
        }

        // 重新获取详情以更新状态
        this.fetchOrderDetails(this.data.orderId);
      } else {
        console.error(`[progress_specialOperation] [performAction] 动作失败: ${action}, msg=${res.result.msg}`);
        wx.showToast({
          title: res.result.msg || '操作失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(`[progress_specialOperation] [performAction] 网络错误: ${action}`, err);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    });
  },

  /**
   * 课程握手操作 (Coach Ready / Parent Confirm)
   */
  handleLessonHandshake(e) {
    const { index, subaction } = e.currentTarget.dataset;
    console.log(`[progress_specialOperation] [handleLessonHandshake] index=${index}, subaction=${subaction}`);
    
    let loadingText = subaction === 'coach_ready' ? '确认就绪...' : '家长确认...';
    
    wx.showLoading({ title: loadingText });
    const token = wx.getStorageSync('token');

    wx.cloud.callFunction({
        name: 'execution_order',
        data: {
            action: 'lesson_handshake',
            orderId: this.data.orderId,
            lessonIndex: index + 1,
            subAction: subaction,
            userId: token
        }
    }).then(res => {
        wx.hideLoading();
        if (res.result.code === 0) {
            wx.showToast({ title: '操作成功' });
            this.fetchOrderDetails(this.data.orderId);
        } else {
            wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
        }
    }).catch(err => {
        wx.hideLoading();
        console.error('[handleLessonHandshake] error', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 教练发送支付单
  handleSendOrder(e) {
    const { index } = e.currentTarget.dataset;
    wx.showLoading({ title: '发送中...' });
    const token = wx.getStorageSync('token');
    
    wx.cloud.callFunction({
        name: 'execution_order',
        data: {
            action: 'send_lesson_order',
            orderId: this.data.orderId,
            lessonIndex: index + 1,
            userId: token
        }
    }).then(res => {
        wx.hideLoading();
        if (res.result.code === 0) {
            wx.showToast({ title: '已发送支付单' });
            this.fetchOrderDetails(this.data.orderId);
        } else {
            wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
        }
    }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 家长支付
  handlePayOrder(e) {
    const { index } = e.currentTarget.dataset;
    wx.showLoading({ title: '准备支付...' });
    const token = wx.getStorageSync('token');
    
    // 1. 获取支付参数
    wx.cloud.callFunction({
        name: 'execution_order',
        data: {
            action: 'get_payment_params',
            orderId: this.data.orderId,
            lessonIndex: index + 1,
            userId: token
        }
    }).then(res => {
        wx.hideLoading();
        if (res.result.code !== 0) {
            wx.showToast({ title: res.result.msg || '获取支付参数失败', icon: 'none' });
            return;
        }

        const { payment, mock } = res.result;

        // 2. 如果是模拟支付 (未配置商户号)
        if (mock) {
             wx.showModal({
                 title: '模拟支付',
                 content: '检测到未配置微信支付商户号，是否模拟支付成功？',
                 success: (mRes) => {
                     if (mRes.confirm) {
                         this.doPaySuccess(index + 1);
                     }
                 }
             });
             return;
        }

        // 3. 调起微信支付
        wx.requestPayment({
            ...payment,
            success: (payRes) => {
                console.log('支付成功', payRes);
                // 支付成功后，通知后端更新状态
                this.doPaySuccess(index + 1);
            },
            fail: (err) => {
                console.error('支付失败', err);
                if (err.errMsg.indexOf('cancel') === -1) {
                    wx.showToast({ title: '支付失败', icon: 'none' });
                }
            }
        });

    }).catch(err => {
        wx.hideLoading();
        console.error('支付请求失败', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 确认支付成功
  doPaySuccess(lessonIndex) {
    wx.showLoading({ title: '确认结果...' });
    const token = wx.getStorageSync('token');
    wx.cloud.callFunction({
        name: 'execution_order',
        data: {
            action: 'pay_lesson',
            orderId: this.data.orderId,
            lessonIndex: lessonIndex,
            userId: token
        }
    }).then(res => {
        wx.hideLoading();
        if (res.result.code === 0) {
            wx.showToast({ title: '支付成功' });
            this.fetchOrderDetails(this.data.orderId);
        } else {
            wx.showToast({ title: res.result.msg || '支付失败', icon: 'none' });
        }
    });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    if (this.data.orderId) {
      this.fetchOrderDetails(this.data.orderId);
    } else {
      wx.stopPullDownRefresh();
    }
  }
})
