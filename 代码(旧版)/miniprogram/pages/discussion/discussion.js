Page({
  data: {
    tabs: ["体能课分享", "匿名树洞", "闲聊氛围", "体育生专区"],
    activeTab: 0,
    searchText: '',
    showPublishModal: false,
    
    // 发布帖子相关
    newPost: {
      title: '',
      content: '',
      tag: '',
      images: []
    },

    // 每个 tab 对应帖子数组（二维数组）
    posts: [
      // 体能课分享
      [
        {
          id: 1,
          avatarText: "体",
          nickname: "体育小王",
          time: "2小时前",
          distance: "1.2 km",
          status: "活跃",
          tag: "体能训练",
          title: "今天训练腿快断了",
          desc: "深蹲 + 冲刺真的累哭……有没有小伙伴一起加油的？",
          img: "/images/test.jpg",
          likes: 24,
          comments: 8,
          shares: 3,
          liked: false
        }
      ],

      // 匿名树洞
      [
        {
          id: 2,
          avatarText: "匿",
          nickname: "匿名用户",
          time: "10分钟前",
          distance: "0 km",
          status: "私密",
          tag: "情感",
          title: "最近压力好大",
          desc: "就想找个树洞发泄一下，训练和学习的压力真的很大。",
          img: "",
          likes: 5,
          comments: 1,
          shares: 0,
          liked: false
        }
      ],

      // 闲聊氛围
      [
        {
          id: 3,
          avatarText: "聊",
          nickname: "运动达人",
          time: "2小时前",
          distance: "1.2 km",
          status: "活跃",
          tag: "日常",
          title: "今天天气真好，适合户外运动",
          desc: "下午去操场跑步了，遇到了很多志同道合的朋友！",
          img: "/images/test.jpg",
          likes: 24,
          comments: 8,
          shares: 3,
          liked: false
        }
      ],

      // 体育生专区
      [
        {
          id: 4,
          avatarText: "专",
          nickname: "体育专业",
          time: "1小时前",
          distance: "2.1 km",
          status: "专业",
          tag: "运动分享",
          title: "我觉得我的短跑技术又提升了",
          desc: "今天 100m 跑出了个人最好成绩！11秒23！",
          img: "",
          likes: 10,
          comments: 4,
          shares: 1,
          liked: false
        }
      ]
    ]
  },

  onLoad() {
    this.loadPosts();
  },

  // 加载帖子数据
  loadPosts() {
    const app = getApp();
    const token = app.globalData.token;
    
    if (token) {
      // 从后端加载帖子数据
      wx.request({
        url: 'http://127.0.0.1:3000/posts',
        method: 'GET',
        header: {
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          if (res.data.status === 'success') {
            this.setData({
              posts: res.data.posts || this.data.posts
            });
          }
        }
      });
    }
  },

  // 切换标签页
  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      activeTab: index
    });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchText: e.detail.value
    });
  },

  // 搜索帖子
  onSearch() {
    const searchText = this.data.searchText.trim();
    if (!searchText) return;

    wx.showToast({
      title: '搜索功能开发中',
      icon: 'none'
    });
  },

  // 显示发布模态框
  showPublishModal() {
    this.setData({
      showPublishModal: true
    });
  },

  // 隐藏发布模态框
  hidePublishModal() {
    this.setData({
      showPublishModal: false,
      newPost: {
        title: '',
        content: '',
        tag: '',
        images: []
      }
    });
  },

  // 发布帖子表单输入
  onPostTitleInput(e) {
    this.setData({
      'newPost.title': e.detail.value
    });
  },

  onPostContentInput(e) {
    this.setData({
      'newPost.content': e.detail.value
    });
  },

  onPostTagInput(e) {
    this.setData({
      'newPost.tag': e.detail.value
    });
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 3, // 最多选择3张图片
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          'newPost.images': [...this.data.newPost.images, ...res.tempFilePaths]
        });
      }
    });
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.newPost.images];
    images.splice(index, 1);
    this.setData({
      'newPost.images': images
    });
  },

  // 提交发布
  submitPost() {
    const { title, content, tag, images } = this.data.newPost;
    const activeTab = this.data.activeTab;

    if (!title.trim() || !content.trim()) {
      wx.showToast({
        title: '请填写标题和内容',
        icon: 'none'
      });
      return;
    }

    const app = getApp();
    const token = app.globalData.token;

    if (!token) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '发布中...'
    });

    // 模拟发布成功
    setTimeout(() => {
      const newPostItem = {
        id: Date.now(),
        avatarText: "我",
        nickname: app.globalData.nickname || "用户",
        time: "刚刚",
        distance: "0 km",
        status: "新发布",
        tag: tag || "未分类",
        title: title,
        desc: content,
        img: images[0] || "",
        likes: 0,
        comments: 0,
        shares: 0,
        liked: false
      };

      const posts = [...this.data.posts];
      posts[activeTab].unshift(newPostItem);

      this.setData({
        posts: posts,
        showPublishModal: false,
        newPost: {
          title: '',
          content: '',
          tag: '',
          images: []
        }
      });

      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });
    }, 1000);
  },

  // 点赞功能
  onLike(e) {
    const { postId, tabIndex, postIndex } = e.currentTarget.dataset;
    const posts = [...this.data.posts];
    const post = posts[tabIndex][postIndex];

    if (post.liked) {
      post.likes--;
      post.liked = false;
    } else {
      post.likes++;
      post.liked = true;
    }

    this.setData({
      posts: posts
    });

    // 发送点赞请求到后端
    wx.request({
      url: `http://127.0.0.1:3000/posts/${postId}/like`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${getApp().globalData.token}`
      }
    });
  },

  // 评论功能
  onComment(e) {
    const { postId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/discussion/comment/comment?postId=${postId}`
    });
  },

  // 分享功能
  onShare(e) {
    const { postId, tabIndex, postIndex } = e.currentTarget.dataset;
    const post = this.data.posts[tabIndex][postIndex];
    
    // TODO: 实现具体分享逻辑
    console.log('分享帖子:', postId, post);
    
    wx.showActionSheet({
      itemList: ['分享到微信', '分享到朋友圈', '复制链接'],
      success: () => {
        wx.showToast({
          title: '分享成功',
          icon: 'success'
        });
        
        // 更新分享数
        const posts = [...this.data.posts];
        posts[tabIndex][postIndex].shares++;
        this.setData({
          posts: posts
        });
      }
    });
  },

  // 查看详情
  onViewDetail(e) {
    const { postId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/discussion/detail/detail?postId=${postId}`
    });
  }
});
