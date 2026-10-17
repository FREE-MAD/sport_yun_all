Page({
  data: {
    orderId: '',
    collection: '',
    orderData: [],
    willingList: [],
    loading: true
  },

  onLoad(options) {
    const { id, collection } = options
    if (id && collection) {
      this.setData({ orderId: id, collection })
      this.fetchDetail(id, collection)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async fetchDetail(id, collection) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'execution_order',
        data: {
          action: 'admin_get_detail',
          id: id,
          collection: collection
        }
      })

      if (res.result.code !== 0) {
        throw new Error(res.result.msg)
      }

      const data = res.result.data
      
      // Extract willing list
      let willingList = []
      if (data.Willing_coach && Array.isArray(data.Willing_coach.willing)) {
        willingList = data.Willing_coach.willing.map(item => ({
            ...item,
            displayParams: {
                nickname: (item.userInfo && item.userInfo.nickName) ? item.userInfo.nickName : (item.nickname || 'Unknown'),
                avatar: (item.userInfo && item.userInfo.avatarUrl) ? item.userInfo.avatarUrl : item.avatar
            }
        }))
      } else if (data.coach_negotiation && Array.isArray(data.coach_negotiation.candidates)) {
         willingList = data.coach_negotiation.candidates.map(item => ({
            ...item,
            displayParams: {
                nickname: item.nickname || 'Unknown',
                avatar: item.avatar
            }
        }))
      }

      // Determine acceptor
      const acceptorOpenid = data.acceptorOpenid || (data.coach_negotiation && data.coach_negotiation.selected_coach && data.coach_negotiation.selected_coach.openid);
      
      // Format data for display
      const formattedData = Object.keys(data).map(key => {
        let value = data[key]
        if (typeof value === 'object') {
          try {
            value = JSON.stringify(value, null, 2)
          } catch (e) {
            value = '[Object]'
          }
        } else if (key.endsWith('At') || key.endsWith('Time')) {
             // 尝试格式化时间
             try {
                 const date = new Date(value);
                 if (!isNaN(date.getTime())) {
                     value = `${value} (${date.toLocaleString()})`;
                 }
             } catch(e) {}
        }
        return { key, value }
      })

      this.setData({
        orderData: formattedData,
        willingList: willingList,
        acceptorOpenid: acceptorOpenid || '',
        loading: false
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败: ' + (err.message || ''), icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async handleAssignCoach(e) {
    const coach = e.currentTarget.dataset.coach;
    if (!coach || !coach.openid) {
      wx.showToast({ title: '缺少教练信息', icon: 'none' });
      return;
    }

    const that = this;
    wx.showModal({
      title: '确认指派',
      content: `确定将订单指派给教练 ${coach.nickname || coach.openid} 吗？`,
      success(res) {
        if (res.confirm) {
          that.doAssign(coach);
        }
      }
    });
  },

  async doAssign(coach) {
    wx.showLoading({ title: '指派中' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'execution_order',
        data: {
          action: 'admin_assign_coach',
          orderId: this.data.orderId,
          coachId: coach.userId || coach._id, // Adapt to likely field names
          coachOpenid: coach.openid
        }
      });

      wx.hideLoading();
      if (res.result.code === 0) {
        wx.showToast({ title: '指派成功', icon: 'success' });
        // Refresh data
        this.onRefresh();
      } else {
        wx.showToast({ title: '指派失败: ' + res.result.msg, icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '调用失败', icon: 'none' });
    }
  },

  onRefresh() {
    if (this.data.orderId && this.data.collection) {
      this.setData({ loading: true, orderData: [] })
      this.fetchDetail(this.data.orderId, this.data.collection)
    }
  },

  showManualAssign() {
    const that = this;
    wx.showModal({
      title: '手动指派',
      content: '请输入教练的 OpenID',
      editable: true,
      placeholderText: 'Coach OpenID',
      success(res) {
        if (res.confirm && res.content) {
          const openid = res.content.trim();
          if (!openid) return;
          
          that.doAssign({
              openid: openid,
              nickname: 'Manual Assigned'
          });
        }
      }
    });
  },

  copyText(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({
      data: String(text),
      success: () => {
        wx.showToast({ title: '已复制', icon: 'none' })
      }
    });
  }
})