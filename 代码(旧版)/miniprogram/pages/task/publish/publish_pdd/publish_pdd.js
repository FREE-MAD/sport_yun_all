// pages/task/publish/publish_pdd/publish_pdd.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 0,
    topSafe: 0,
    
    // Form Data
    form: {
      title: '',
      frequency: '',
      category: '',
      description: '',
      price_interval: '',
      location: '',
      ing_day_time: '',
      group_rules: '',
      contact: '',
      coach_id: '', // New: Specified Coach ID
      accept_group: false, // Willing to group
    },
    showCover: false,
    categoryList: ['体育', '家教', '陪练', '其他'],
    publishType: '附近课程', // Default tab
    nearbyList: [], // Nearby courses list

    // Class Selection Data
    classTypes: [
      {
        id: 1,
        name: '少儿体适能',
        brief: '提升孩子基础运动能力',
        subItems: ['初级班', '中级班', '高级班'],
        images: ['/images/class/fitness1.png', '/images/class/fitness2.png'],
        planText: '包括跑跳投基础训练，协调性训练等。'
      },
      {
        id: 2,
        name: '篮球训练营',
        brief: '专业篮球技巧指导',
        subItems: ['控球特训', '投篮特训', '实战对抗'],
        images: ['/images/class/basketball1.png'],
        planText: '运球基本功，投篮姿势矫正，战术配合。'
      },
      {
        id: 3,
        name: '游泳私教',
        brief: '一对一游泳教学',
        subItems: null,
        images: ['/images/class/swim.png'],
        planText: '针对性教学，快速掌握泳姿。'
      }
    ],
    currentClassId: null,
    expandedClassId: null,
    selectedSubName: null,
    currentClass: null,
    isSubmitting: false, // Prevent duplicate submission
    // Intention Data (Added for compatibility)
    showIntentionModal: false,
    intentionForm: {
      time: '',
      location: '',
      childCount: 1
    }
  },

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    const h = (info.statusBarHeight || 20) + 40; // Adjust safe-top height
    this.setData({ statusBarHeight: info.statusBarHeight, topSafe: h });

    // Handle jump from publish.js (receiving orderId)
    // If an ID is passed, we assume the user wants to VIEW/JOIN the order.
    // Since this page is a Publish Form, we forward the user to the Detail/Progress Page.
    if (options.id) {
      console.log('Redirecting to progress page with id:', options.id);
      wx.redirectTo({
        url: `/pages/task/progress/progress_specialOperation/progress_specialOperation?id=${options.id}`
      });
      return;
    }
    
    // Initialize nearby list
    this.fetchNearbyList();
  },

  onPublishTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ publishType: tab });
    if (tab === '附近课程') {
      this.fetchNearbyList();
    }
  },

  // Fetch nearby courses list
  fetchNearbyList() {
      console.log('[publish_pdd] [fetchNearbyList] 开始获取附近课程列表...');
      wx.showLoading({ title: '加载中...' });
      
      const userId = app.globalData.token;
      // Explicitly specify environment ID to avoid implicit conversion errors
      const envId = 'cloud1-6gh7jgl8c5b16a83';
      
      wx.cloud.callFunction({
        name: 'negotiation_parent',
        config: {
          env: envId
        },
        data: {
          action: 'list_othersparent',
          mode: 'nearby',
          userRole: 'P',
          userId: userId
        }
      }).then(res => {
      wx.hideLoading();
      wx.stopPullDownRefresh();
      if (res.result.code === 0) {
        console.log(`[publish_pdd] [fetchNearbyList] 获取成功, 数量: ${res.result.data.length}`);
        const list = res.result.data.map(item => {
          if (!item._id) console.warn('[publish_pdd] [fetchNearbyList] 警告: item 缺少 _id:', item);
          return {
            id: item._id,
            // avatar: item.userInfo?.avatarUrl || '/images/icons/avatar.png',
            name: item.userInfo?.nickName || '家长',
            desc: item.title || item.description || '可进入',
            distance: '未知距离'
          };
        });
        
        this.setData({ nearbyList: list });
      } else {
        console.error(`[publish_pdd] [fetchNearbyList] 获取失败: ${res.result.msg}`);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.stopPullDownRefresh();
      console.error('[publish_pdd] [fetchNearbyList] 网络错误:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  onNearbyItemTap(e) {
    const id = e.currentTarget.dataset.id;
    console.log('onNearbyItemTap id:', id);
    
    if (!id) {
      wx.showToast({ title: '无法查看详情', icon: 'none' });
      return;
    }

    // Jump to the Progress/Detail Page
    wx.navigateTo({
      url: `/pages/task/progress/progress_specialOperation/progress_specialOperation?id=${id}`
    });
  },

  chooseLocation() {
    this.setData({ showCover: true });
    wx.chooseLocation({
      success: (res) => {
        console.log('[publish_pdd] [chooseLocation] 选点成功:', res);
        this.setData({
          'form.location': res.name || res.address,
          'form.latitude': res.latitude,
          'form.longitude': res.longitude
        });
      },
      fail: (err) => {
        console.log('fail', err);
        wx.showToast({ title: '无法获取位置权限', icon: 'none' });
      },
      complete: () => {
        this.setData({ showCover: false });
      }
    });
  },

  onDateChange(e) {
    this.setData({
      'form.ing_day_time': e.detail.value
    });
  },
  
  // ========== Sports Goal Selection Logic ==========
  onSelectClass(e) {
    const id = e.currentTarget.dataset.id;
    const targetClass = this.data.classTypes.find(item => item.id === id);
    
    // 如果点击的是已经选中的，则不进行重复渲染（或者根据需求决定是否切换折叠）
    // 这里保持简单，只要不同就切换
    if (this.data.currentClassId !== id) {
      this.setData({
        currentClassId: id,
        currentClass: targetClass,
        expandedClassId: null, // 清除展开状态，防止变形 (根据建议修改)
        selectedSubName: null
      }, () => {
         // 延迟展开或直接展开，视效果而定。
         // 建议：如果不需要自动展开，可以把下面这行去掉。
         // 如果需要自动展开，确保布局已经稳定。
         this.setData({ expandedClassId: id });
      });
    
      // Auto-fill form description
      this.setData({
        'form.category': targetClass.name,
        'form.title': `寻找${targetClass.name}相关教练/陪练`,
        'form.description': `我想学习${targetClass.name}，${targetClass.brief}。`
      });
    }
  },

  onToggleClassExpand(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expandedClassId: this.data.expandedClassId === id ? null : id
    });
  },

  onSelectSubItem(e) {
    const { parentId, name } = e.currentTarget.dataset;
    const targetClass = this.data.classTypes.find(item => item.id === parentId);
    
    this.setData({
      currentClassId: parentId,
      currentClass: targetClass,
      selectedSubName: name
    });

    // Update form description
    this.setData({
      'form.category': targetClass.name,
      'form.title': `寻找${targetClass.name}(${name})相关教练/陪练`,
      'form.description': `我想学习${targetClass.name}，专项练习：${name}。`
    });
  },

  // ========== Input Binding ==========
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },
  onCategoryChange(e) {
    this.setData({
      'form.category': this.data.categoryList[e.detail.value]
    });
  },

  // ========== Submit ==========
  onSubmit() {
    if (this.data.isSubmitting) return;

    const rawForm = this.data.form;
    const { publishType } = this.data;

    console.log(`[publish_pdd] [onSubmit] 开始发布, 类型: ${publishType}`);

    // 1. Validation
    if (publishType === '指定教练员') {
      if (!rawForm.coach_id || !String(rawForm.coach_id).trim()) {
        wx.showToast({ title: '请填写教练员ID', icon: 'none' });
        return;
      }
    } else if (publishType === '发布看看') {
      if (!rawForm.location) {
        wx.showToast({ title: '请选择任务位置', icon: 'none' });
        return;
      }
      if (!rawForm.frequency || !String(rawForm.frequency).trim()) {
        wx.showToast({ title: '请填写任务频次', icon: 'none' });
        return;
      }
      if (!rawForm.ing_day_time) {
        wx.showToast({ title: '请选择日期要求', icon: 'none' });
        return;
      }
      if (!rawForm.contact || !String(rawForm.contact).trim()) {
        wx.showToast({ title: '请填写联系方式', icon: 'none' });
        return;
      }
    }

    const token = wx.getStorageSync('token');
    
    // 2. Build submit data
    const submitForm = {
      ...rawForm,
      publish_type: publishType,
      usertoken: token || 'guest_token',
      userInfo: app.globalData.userInfo || { nickName: '发布者', avatarUrl: '' },
      create_time: new Date().toISOString()
    };

    // 3. Submit to cloud
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '发布中...' });
    
    wx.cloud.callFunction({
      name: 'execution_order',
      data: {
        action: 'publish',
        submitForm,
        userId: token,
        userRole: 'P' 
      },
      success: (res) => {
        wx.hideLoading();
        console.log('[publish_pdd] [onSubmit] 发布结果:', res);
        
        const result = res.result || {};
        if (result.code === 0 || result.status === 'success' || result._id) {
            console.log(`[publish_pdd] [onSubmit] 发布成功, OrderID: ${result.orderId || result._id}`);
            wx.showToast({ title: '发布成功' });
            
            if (result.orderId) {
              wx.setStorageSync('current_req_id', result.orderId);
            }
            
            setTimeout(() => {
              // Redirect to the progress/detail page
              const targetId = result.orderId || result._id;
              if (targetId) {
                  wx.redirectTo({
                      url: `/pages/task/progress/progress_specialOperation/progress_specialOperation?id=${targetId}`
                  });
              } else {
                  wx.navigateBack();
              }
            }, 1500);
          } else {
          this.setData({ isSubmitting: false });
          console.error(`[publish_pdd] [onSubmit] 发布失败: ${result.msg}`);
          wx.showToast({ 
            title: result.msg || '发布失败，请重试', 
            icon: 'none' 
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
        console.error('[publish_pdd] [onSubmit] 网络请求失败:', err);
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      }
    });
  },

  onPullDownRefresh() {
    if (this.data.publishType === '附近课程') {
        this.fetchNearbyList();
    } else {
        wx.stopPullDownRefresh();
    }
  },

  // ========== Join Group Logic (Copied from progress_specialOperation) ==========
  openIntentionModal() {
    this.setData({ showIntentionModal: true });
  },

  closeIntentionModal() {
    this.setData({ showIntentionModal: false });
  },

  preventBubble() {},

  handleIntentionInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`intentionForm.${field}`]: e.detail.value
    });
  },

  incrementChild() {
    this.setData({
      'intentionForm.childCount': (this.data.intentionForm.childCount || 1) + 1
    });
  },

  decrementChild() {
    const count = this.data.intentionForm.childCount || 1;
    if (count > 1) {
      this.setData({
        'intentionForm.childCount': count - 1
      });
    }
  },

  submitIntention() {
    const { time, location, childCount } = this.data.intentionForm;
    
    // Validation
    if (!time && !location) {
      wx.showToast({ title: '请至少填写一项偏好', icon: 'none' });
      return;
    }

    console.log('[publish_pdd] [submitIntention] 提交意向:', this.data.intentionForm);
    wx.showLoading({ title: '提交中' });
    wx.cloud.callFunction({
      name: 'negotiation_parent',
      data: {
        action: 'join',
        orderId: this.data.orderId,
        intention: { time, location, childCount }
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result.code === 0) {
        console.log('[publish_pdd] [submitIntention] 加入成功');
        wx.showToast({ title: '加入成功' });
        this.closeIntentionModal();
        // If we are on the publish page, we might want to refresh or navigate
        if (this.data.publishType === '附近课程') {
             this.fetchNearbyList();
        }
      } else {
        console.error(`[publish_pdd] [submitIntention] 加入失败: ${res.result.msg}`);
        wx.showToast({ title: res.result.msg || '提交失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('[publish_pdd] [submitIntention] 网络错误:', err);
      wx.showToast({ title: '提交失败', icon: 'none' });
    });
  },

  handleJoinGroupChat() {
    const orderId = this.data.orderId;
    if (!orderId) {
      wx.showToast({ title: '订单ID缺失', icon: 'none' });
      return;
    }

    // Logic similar to progress_specialOperation
    // Since this page might not have userState, we assume not_joined if not present
    const userState = this.data.userState || 'not_joined';

    if (userState === 'not_joined') {
      this.openIntentionModal();
    } else {
      wx.navigateTo({
        url: `/pages/private_talk/private_talk_detail/private_talk_detail?conversationId=${orderId}&type=group`
      });
    }
  }
});
