// pages/task/progress/progress.js
const app = getApp()

Page({
  data: {
    orders: [],
    currentTab: 0,
    tabs: [
      { label: '事务处理', status: 'processing' },
      { label: '进行中', status: 'ongoing' },
      { label: '已完成', status: 'completed' },
    ],
    loading: false,
    currentUserRole: '',
    currentUserToken: ''
  },

  onLoad() {
    if (app.globalData.userRole && app.globalData.token) {
      this.setData({
        currentUserRole: app.globalData.userRole,
        currentUserToken: app.globalData.token
      })
    } else {
      // 建立“数据准备完成通知机制”
      app.globalDataReadyCallback = (globalData) => {
        console.log('[progress] globalDataReadyCallback triggered', globalData)
        this.setData({
          currentUserRole: globalData.userRole,
          currentUserToken: globalData.token
        })
        // 数据准备好后，自动刷新列表
        this.loadOrders()
      }
    }
  },

  // 页面显示时拉取
  onShow() {
    // 每次显示页面都尝试刷新数据
    if (this.data.currentUserRole && this.data.currentUserToken) {
      this.loadOrders()
    } else if (app.globalData.token) {
        // 如果 data 中没有 token，尝试从 globalData 重新获取
        this.setData({
            currentUserRole: app.globalData.userRole,
            currentUserToken: app.globalData.token
        }, () => {
            this.loadOrders();
        });
    }
  },

  onPullDownRefresh() {
      this.loadOrders().then(() => {
          wx.stopPullDownRefresh();
      });
  },

  // 标签切换
  onTabChange(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.currentTab) return

    this.setData({ currentTab: index })
    this.loadOrders()
  },

  // ================== 拉取订单列表 ==================
  loadOrders() {
    if (this.data.loading) return

    const { currentUserToken, currentUserRole } = this.data
    
    // 如果没有身份信息，暂停请求（等待 callback 自动触发）
    if (!currentUserToken || !currentUserRole) {
      console.log('[progress] loadOrders - waiting for user info...')
      return
    }

    const { status } = this.data.tabs[this.data.currentTab]
    
    console.log('[progress] loadOrders - start', { status, currentUserRole, currentUserToken })

    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    wx.cloud.callFunction({
      name: 'execution_order',
      data: {
        action: 'list_myself',
        mode: 'self', // 必须指定 mode
        // status, // 移除传给后端的 status，改由前端过滤
        userId: currentUserToken,
        role: currentUserRole, // 后端 list action 需要 role
        userRole: currentUserRole // 保持兼容
      },
      success: res => {
        console.log('[progress] loadOrders - success', res)
        if (res.result?.code === 0) {
          const allOrders = res.result.data || []
          console.log('[progress] loadOrders - total count from server:', allOrders.length)

          // 前端过滤逻辑
          const TAB_STATE_MAP = {
            ongoing: ['accepted', 'in_progress'],
            completed: ['p_completed', 'completed', 'cancelled', 'closed'],
            processing: ['pending']
          }

          const filteredOrders = allOrders.filter(item => {
            const state = item.fulfill_state || 'pending' // 默认 pending
            const allowedStates = TAB_STATE_MAP[status] || []
            return allowedStates.includes(state)
          })
          
          console.log(`[progress] filtered for tab '${status}':`, filteredOrders.length)
          
          const tasks = filteredOrders.map(item => {
            // 优先使用 fulfill_state，兼容旧 status
            const state = item.fulfill_state || item.status || 'pending';
            let statusText = '';
            let statusClass = '';

            // 区分 创建 vs 加入
            let relationType = 'joined';
            if (item.publisher_Id === currentUserToken) {
                relationType = 'created';
            }

            const myOpenid = app.globalData.openid;

            switch(state) {
              case 'pending':
                // 如果是 pending 状态，且我在 Willing_coach.willing 中，显示“等待平台派单”
                if (item.Willing_coach?.willing?.some(c => c.openid === myOpenid || c.userId === currentUserToken)) {
                    statusText = '等待平台派单';
                    statusClass = 'pending';
                } else {
                    statusText = '待接单';
                    statusClass = 'pending';
                }
                break;
              case 'accepted':
                statusText = '已接单';
                statusClass = 'ongoing';
                break;
              case 'in_progress':
                statusText = '进行中';
                statusClass = 'ongoing';
                break;
              case 'p_completed':
                statusText = '待确认';
                statusClass = 'ongoing'; 
                break;
              case 'completed':
                statusText = '已完成';
                statusClass = 'completed';
                break;
              case 'cancelled':
                statusText = '已取消';
                statusClass = 'cancelled';
                break;
              case 'closed':
                statusText = '已关闭';
                statusClass = 'cancelled';
                break;
              default:
                statusText = state;
                statusClass = 'processing';
            }

            return {
              ...item,
              id: item._id, // wxml uses id
              status: statusClass,
              statusText,
              deadline: item.ing_day_time || item.deadline, // 兼容字段
              userRole: currentUserRole === 'P' ? 'publisher' : 'acceptor',
              relationType: relationType, // 前端可据此显示 "我发布的" 或 "我加入的"
              // otherUser 暂时无法获取，需要联表查询，此处暂留空或后续优化
            };
          });

          this.setData({
            tasks: tasks,
            orders: allOrders // 保留所有数据，或者可以考虑缓存
          })
        } else {
          console.error('[progress] loadOrders - error code:', res.result?.code, res.result?.msg)
          wx.showToast({
            title: res.result?.msg || '加载失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('[progress] loadOrders - network fail', err)
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
        wx.stopPullDownRefresh() // 停止下拉刷新
        this.setData({ loading: false })
      }
    })
  },

  // ================== 下拉刷新 ==================
  onPullDownRefresh() {
    this.setData({ loading: false }) // 重置 loading 状态以允许刷新
    this.loadOrders()
  },

  // ================== 查看详情 ==================
  onOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/task/detail/task_detail?id=${orderId}`
    })
  },

  // ================== 查看详情与操作 ==================
  onViewDetail(e) {
    const orderId = e.currentTarget.dataset.id
    const { currentUserRole } = this.data
    console.log('[progress] onViewDetail:', orderId)
    
    if (!orderId) {
      console.error('onViewDetail error: orderId is missing');
      wx.showToast({ title: '无法查看详情', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/task/progress/progress_specialOperation/progress_specialOperation?id=${orderId}&role=${currentUserRole}`
    })
  },

  // ================== 联系用户 ==================
  onContactUser(e) {
    const targetUserId = e.currentTarget.dataset.id
    if (!targetUserId) return
    
    wx.navigateTo({
      url: `/pages/private_talk/private_talk_detail/private_talk_detail?targetUserId=${targetUserId}`
    })
  },

  // ================== 重新发布 ==================
  onRepublish(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/task/publish/publish?taskId=${orderId}`
    })
  }
})
