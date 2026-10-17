
Page({
  data: {
    userRole:"",
    activeChip: "all",

    metrics: [
      { label: "新任务", num: 23 },
      { label: "已完成", num: 56 },
      { label: "进行中", num: 78 },
      { label: "洽谈中", num: 12 },
    ],

    chips: [
      { key: "all", name: "全部任务" },
      { key: "today", name: "今日发布" },
      { key: "high", name: "高薪" },
      { key: "near", name: "附近" },
      { key: "urgent", name: "紧急" },
      { key: "online", name: "线上" },
    ],

    
    f_list: [],
    loading: false,
    Filterlist:[],
    // 新增分页相关字段（不修改原有任何内容）
    pageNum: 1,          // 当前页码
    pageSize: 10,        // 每页展示条数
    hasMore: true,       // 是否有更多数据
    filteredTotal: []    // 筛选后的全量数据（用于分页截取）
  },

  onLoad() {
    const  userRole= wx.getStorageSync('userRole'); 
    console.log('在mainjob-list页面调用本地身份信息:',  userRole);
    if ( userRole) {
      this.setData({
         userRole:  userRole 
      });
    } else {
      console.log('未找到本地身份信息');
      // 可选择跳转登录页或请求身份
    }
    const token = wx.getStorageSync('token');
    if (token) {
      wx.cloud.callFunction({
        name: 'login_fun',
        data: {},
        success: (res) => {
          const result = res.result || {};
          console.log('[main_job] login_fun 返回结果:', result);
          if (result.status === 'success') {
            const latitude = result.latitude;
            const longitude = result.longitude;
            console.log('[main_job] 用户经纬度:', latitude, longitude);
            const app = getApp();
            if (app.globalData) {
              app.globalData.userLocation = { latitude, longitude };
              console.log('[main_job] 已写入全局 userLocation:', app.globalData.userLocation);
            }
          } else {
            console.log('[main_job] login_fun 返回非 success 状态');
          }
        },
        fail: (err) => {
          console.error('[main_job] 调用 login_fun 获取经纬度失败', err);
        }
      });
    } else {
      console.log('[main_job] 本地未找到用户 token，跳过经纬度获取');
    }
    this.fetchData();
  },

  // ===============================
  // 从后端拉取数据
  fetchData() {
    this.setData({ loading: true });
    
    // 获取用户位置（如果有）
    const app = getApp();
    const userLoc = app.globalData.userLocation;

    wx.cloud.callFunction({
      name: 'execution_order',
      data: {
        action: 'list_public'
      },
      success: (res)=> {
        if (res.result.code === 0) {
          let f_List = res.result.data.map(job => {
             let distDisplay = job.dist || '未知';
             let distVal = 99999; 

             if (userLoc && job.submitForm && job.submitForm.latitude && job.submitForm.longitude) {
                 console.log('[main_job] 计算距离: 用户坐标=', userLoc, '任务坐标=', job.submitForm.latitude, job.submitForm.longitude);
                 const dKm = this.calculateDistanceVal(userLoc.latitude, userLoc.longitude, job.submitForm.latitude, job.submitForm.longitude);
                 console.log('[main_job] 计算结果 dKm=', dKm);
                 distVal = dKm;
                 if (dKm < 1) {
                     distDisplay = (dKm * 1000).toFixed(0) + 'm';
                 } else {
                     distDisplay = dKm.toFixed(1) + 'km';
                 }
                 console.log('[main_job] 距离展示文案 distDisplay=', distDisplay);
             } else if (typeof job.dist === 'string' && job.dist.includes('km')) {
                 distVal = parseFloat(job.dist);
             }

             return {
                 ...job,
                 dist: distDisplay,
                 distanceVal: distVal
             };
          });

          console.log('f_List:', f_List);

          this.setData({
            f_list: f_List
          });
          // 只用于更新前端data但是不用于数据渲染
          // this.updateList();
          // 新增：首次加载时触发筛选+分页
          this.updateList();
        } else {
          wx.showToast({
            title: res.result.msg || '加载失败',
            icon: 'none'
          });
        }
      },

      fail: () => {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      },

      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  // ===============================s 点击 chip
  // 示例：点击筛选按钮
  // 点击 chip 切换
tapChip(e) {
  const key = e.currentTarget.dataset.key; // 获取被点击 chip 的 key
  console.log(key);
  this.setData({ 
    activeChip: key,
    pageNum: 1,          // 新增：切换筛选时重置页码为1
    hasMore: true ,
    Filterlist: []         // 新增：重置有更多数据状态
  });      // 更新选中状态
  this.updateList();                      // 根据 chip 重新过滤列表
},
// 过滤逻辑
updateList() {
  const { activeChip, f_list, pageNum, pageSize, Filterlist } = this.data;

  const filtered = f_list.filter(job => {
    if (activeChip === "all") return true;
    if (activeChip === "today") {
      return job.category === "today" || job.timeAgo?.includes("min");
    }
    if (activeChip === "high") return job.price >= 50;
    if (activeChip === "near") {
      // 优先使用计算出的数值距离
      if (job.distanceVal !== undefined && job.distanceVal !== 99999) {
          return job.distanceVal <= 50; // 扩大到50km范围内都算附近，或者保持3km
      }
      const dist = parseFloat(job.dist);
      return job.dist !== "online" && !isNaN(dist) && dist <= 3;
    }
    if (activeChip === "urgent") return job.tags?.includes("urgent");
    if (activeChip === "online") return job.dist === "online";
    return true;
  });

  const start = (pageNum - 1) * pageSize;
  const end = pageNum * pageSize;
  const currentPageData = filtered.slice(start, end);

  this.setData({
    filteredTotal: filtered,
    Filterlist: pageNum === 1
      ? currentPageData
      : [...Filterlist, ...currentPageData],
    hasMore: end < filtered.length
  });
},


  // ===============================e
 

  // 计算距离数值 (km)
  calculateDistanceVal(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 99999;
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
  },

  // ===============================
  // 生成头像首字母
  getInitials(name) {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  },

  // ===============================
  // 主渲染逻辑：仅 chips 过滤

  // 新增：触底加载下一页（小程序原生生命周期，不修改原有任何逻辑）
  onReachBottom() {
    const { hasMore, loading, pageNum } = this.data;
    // 无更多数据/加载中 则不处理
    if (!hasMore || loading) return;

    // 页码+1并重新截取分页数据
    this.setData({
      pageNum: pageNum + 1
    }, () => {
      this.updateList();
    });

    // 无更多数据时提示（可选）
    if (!this.data.hasMore) {
      wx.showToast({
        title: '已加载全部数据',
        icon: 'none',
        duration: 1500
      });
    }
  },
  // 点击转跳,身份判断=========================s
   // 点击 Accept
   tapAccept(e) {
    const userRole = this.data.userRole;
    console.log(userRole);
    // token校验
    if (!userRole) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      }
    else if(userRole){ 
    //  身份校验
    if (userRole==='C') {
    const id = e.currentTarget.dataset.id;
    const item = this.data.f_list.find(x => x._id === id);
    console.log(id);
    if (!item) {
      wx.showToast({
        title: '未找到项目',
        icon: 'none'
      });
      return;
    }
    wx.showToast({
      title: '已接受: ' + item.title,
      icon: 'none',
      duration: 1000
    });
    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/index/main_job/job_detailed/job_detailed?id=${id}`
      });
    }, 1000)
    }
    else if (userRole === 'P' || userRole === 'V')  {
      wx.showToast({
        title: '没有权限,宝宝',
        icon: 'none'
      });
    }
  }
},
  // 点击转跳,身份判断=========================e

});
