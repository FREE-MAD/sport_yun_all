Page({
  data: {
    title: '',
    desc: '',
    contact: '',
    type: '',
    date: '',
    images: []
  },

  // input 双向绑定
  onInputTitle(e) {
    this.setData({ title: e.detail.value });
  },
  onInputDesc(e) {
    this.setData({ desc: e.detail.value });
  },
  onInputContact(e) {
    this.setData({ contact: e.detail.value });
  },

  // 单选类型
  onTypeChange(e) {
    this.setData({ type: e.detail.value });
  },

  // 日期选择
  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  // 图片选择
  chooseImage() {
    wx.chooseImage({
      count: 3, // 最多3张
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const newImages = this.data.images.concat(res.tempFilePaths);
        this.setData({ images: newImages });
      }
    })
  },

  // 删除图片
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const imgs = this.data.images;
    imgs.splice(index, 1);
    this.setData({ images: imgs });
  },

  // 提交表单
  submitForm(e) {
    if (!this.data.title || !this.data.desc || !this.data.type || !this.data.contact) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    wx.request({
      url: 'http://127.0.0.1:3000/task/create', // 后端接口
      method: 'POST',
      data: {
        title: this.data.title,
        desc: this.data.desc,
        type: this.data.type,
        contact: this.data.contact,
        date: this.data.date,
        images: this.data.images
      },
      success: res => {
        if (res.data.status === 'success') {
          wx.showToast({ title: '发布成功', icon: 'success' });
          this.setData({
            title: '',
            desc: '',
            contact: '',
            type: '',
            date: '',
            images: []
          });
        } else {
          wx.showToast({ title: '发布失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    })
  }
})
