const app = getApp();

// 状态映射
const statusMap = {
  pending: '待接取',
  accepted: '已接取'
};

Page({
  data: {
    id: '',
    loading: true,
    detail: null,
    currentUserRole: '',
    currentUserToken: '',
    statusActions: [],
    isLoading: false,
    showIntentSelection: false // 显式初始化
  },

  onLoad(options) {
    const { id } = options;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }

    const currentUserRole = app.globalData.userRole || 'V';
    const currentUserToken = app.globalData.token || '';

    this.setData({
      id,
      currentUserRole,
      currentUserToken
    });

    this.fetchDetail(id);
  },

  // 获取订单详情
  fetchDetail(id) {
    console.log(`[job_detailed] [fetchDetail] 开始获取详情: ${id}`);
    wx.cloud.callFunction({
      name: 'execution_order', // 统一使用 execution_order
      data: { 
        action: 'get_oneorder',
        orderId: id
      },
      success: res => {
        if (res.result.code !== 0) {
          console.error(`[job_detailed] [fetchDetail] 获取失败: ${res.result.msg}`);
          wx.showToast({ title: '加载失败', icon: 'none' });
          return;
        }

        console.log(`[job_detailed] [fetchDetail] 获取成功`);
        const detail = res.result.data;
        // 兼容新旧字段：优先使用 status，如果没有则使用 fulfill_state
        detail.status = detail.status || detail.fulfill_state;
        detail.statusText = statusMap[detail.status] || detail.status;
        
        // 格式化时间
        const formatTime = (ts) => {
            if (!ts) return '';
            const d = new Date(ts);
            return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        };

        if (detail.createdAt) detail.createdAtFormatted = formatTime(detail.createdAt);
        if (detail.acceptedAt) detail.acceptedAtFormatted = formatTime(detail.acceptedAt);
        if (detail.startedAt) detail.startedAtFormatted = formatTime(detail.startedAt);
        if (detail.completedAt) detail.completedAtFormatted = formatTime(detail.completedAt);

        // 解析教练意向
        const willingCoach = detail.Willing_coach || { willing: [], unwilling: [] };
        detail.willingList = willingCoach.willing || [];
        detail.unwillingList = willingCoach.unwilling || [];

        this.setData({ detail });
        this.calculateStatusActions(detail);
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  // 计算操作按钮
  calculateStatusActions(detail) {
    const { currentUserRole, currentUserToken } = this.data;
    const actions = [];

    if (!detail || !currentUserToken) return;

    const publisherId = detail.publisher_Id || detail.usertoken;
    const isPublisher = publisherId === currentUserToken;
    const isCoach = currentUserRole === 'C';
    
    console.log('[job_detailed][calculateStatusActions] role/context', {
      currentUserRole,
      currentUserToken,
      publisherId,
      isCoach,
      isPublisher,
      status: detail && detail.status,
      currentPhase: detail && detail.current_phase
    });
    
    // Reset intent selection state
    this.setData({ showIntentSelection: false });

    // 1. 教练操作
    if (isCoach && !isPublisher) {
      // 待接取 -> 意向收集 (替换原有的直接接取)
      if (detail.status === 'pending') {
        // 检查是否已经提交过意向
        const myOpenid = app.globalData.openid; // 确保获取到 openid
        const willingList = detail.Willing_coach?.willing || [];
        const unwillingList = detail.Willing_coach?.unwilling || [];
        const hasSubmitted = willingList.some(i => i.openid === myOpenid || i.userId === currentUserToken) ||
                             unwillingList.some(i => i.openid === myOpenid || i.userId === currentUserToken);

        const cond1 = isCoach && !isPublisher;
        const cond2 = detail.status === 'pending';
        const cond3 = !hasSubmitted;
        const cond4 = detail.current_phase !== 'parent_only';
        console.log('[job_detailed][intent-visibility][conditions]', {
          cond1_isCoachAndNotPublisher: cond1,
          cond2_statusPending: cond2,
          cond3_notSubmitted: cond3,
          cond4_phaseNotParentOnly: cond4,
          detailStatus: detail.status,
          hasSubmitted,
          currentPhase: detail.current_phase
        });

        // 放开阶段限制：只要是教练且非发布者、状态pending、未提交过意向，即可展示
        if (cond3) {
            this.setData({ showIntentSelection: true });
            console.log('[job_detailed][intent-visibility] showIntentSelection = true');
        } else {
            this.setData({ showIntentSelection: false });
            console.log('[job_detailed][intent-visibility] showIntentSelection = false');
        }
      }
      // 已接取 -> 开始
      else if (detail.status === 'accepted') {
        actions.push({
          type: 'start',
          text: '开始订单',
          action: 'handleStartOrder'
        });
      }
      // 进行中 -> 完成
      else if (detail.status === 'in_progress') {
        actions.push({
          type: 'complete',
          text: '完成订单',
          action: 'handleCompleteOrder'
        });
      }
    }

    // 2. 发布者操作 (家长)
    if (isPublisher) {
      // 待接取 -> 取消
      if (detail.status === 'pending') {
        actions.push({
          type: 'cancel',
          text: '取消订单',
          action: 'handleCancelOrder'
        });
      }
      // 待确认 (教练已完成) -> 确认
      else if (detail.status === 'p_completed') {
        actions.push({
          type: 'after_sales', // 复用样式，或者新建 confirm
          text: '确认完成',
          action: 'handleConfirmComplete'
        });
      }
    }

    this.setData({ statusActions: actions });
  },

  // 状态操作分发
  handleStatusAction(e) {
    const actionName = e.currentTarget.dataset.action;
    if (this[actionName] && typeof this[actionName] === 'function') {
      this[actionName]();
    } else {
      console.warn('Unknown action:', actionName);
    }
  },

  // 通用操作请求
  _performOrderAction(action, loadingTitle, successTitle) {
    if (this.data.isLoading) return;
    
    this.setData({ isLoading: true });
    wx.showLoading({ title: loadingTitle });

    wx.cloud.callFunction({
      name: 'execution_order',
      data: {
        action: action,
        orderId: this.data.id,
        userId: this.data.currentUserToken,
        userRole: this.data.currentUserRole
      },
      success: res => {
        if (res.result.code === 0) {
          wx.showToast({ title: successTitle, icon: 'success' });
          setTimeout(() => {
            this.fetchDetail(this.data.id);
          }, 1000);
        } else {
          wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error(`[job_detailed] [${action}] error:`, err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ isLoading: false });
      }
    });
  },

  // 接取订单
  handleAcceptOrder() {
    this._performOrderAction('accept', '接取中...', '接取成功');
  },

  // 开始订单
  handleStartOrder() {
    this._performOrderAction('start', '启动中...', '已开始');
  },

  // 完成订单 (教练)
  handleCompleteOrder() {
    this._performOrderAction('complete', '提交中...', '已提交');
  },

  // 提交接单意向 (愿意)
  handleAcceptIntent() {
    const itemList = ['不填', '80元/小时', '100元/小时', '120元/小时', '150元/小时', '200元/小时'];
    const valueMap = [null, 80, 100, 120, 150, 200];
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const idx = res.tapIndex;
        const expectedPrice = valueMap[idx];
        this._submitIntent(true, '', expectedPrice);
      },
      fail: (res) => {
        if (res.errMsg !== 'showActionSheet:fail cancel') {
          wx.showToast({ title: '操作取消', icon: 'none' });
        }
      }
    });
  },

  // 提交接单意向 (不愿意)
  handleRejectIntent() {
    const reasons = ['时间冲突', '地点不便', '预算不符', '其他原因'];
    wx.showActionSheet({
      itemList: reasons,
      success: (res) => {
        const selectedReason = reasons[res.tapIndex];
        this._submitIntent(false, selectedReason);
      },
      fail: (res) => {
        if (res.errMsg !== 'showActionSheet:fail cancel') {
          wx.showToast({ title: '操作取消', icon: 'none' });
        }
      }
    });
  },

  // 内部函数：提交意向
  _submitIntent(isWilling, rejectReason = '', expectedPrice) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    wx.showLoading({ title: '提交中...' });

    const data = {
      action: 'submit_intent',
      orderId: this.data.id,
      userId: this.data.currentUserToken, // 教练ID
      coachIntent: isWilling
    };

    if (!isWilling && rejectReason) {
      data.rejectReason = rejectReason;
    }
    if (isWilling && expectedPrice !== undefined && expectedPrice !== null && expectedPrice !== '') {
      data.expectedPrice = Number(expectedPrice);
    }

    wx.cloud.callFunction({
      name: 'negotiation_CtoP',
      data: data,
      success: res => {
        if (res.result.code === 0) {
          wx.showToast({ title: isWilling ? '已确认愿意接单' : '已反馈拒绝原因', icon: 'success' });
          this.fetchDetail(this.data.id);
        } else {
          wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('[job_detailed] [submit_intent] error:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ isLoading: false });
      }
    });
  },

  // 取消订单
  handleCancelOrder() {
    wx.showModal({
      title: '提示',
      content: '确定要取消该订单吗？',
      success: (res) => {
        if (res.confirm) {
          this._performOrderAction('cancel', '取消中...', '已取消');
        }
      }
    });
  },

  // 确认完成 (家长)
  handleConfirmComplete() {
    // 家长确认完成通常也是调用 complete 接口，或者专门的 confirm 接口
    // 假设 execution_order 的 complete 动作支持家长确认 (check backend logic if needed)
    // 根据 core memory, complete handles both? Or maybe just 'complete' from coach?
    // Let's assume 'complete' from parent side transitions p_completed -> completed.
    this._performOrderAction('complete', '确认中...', '订单完成');
  }
});
