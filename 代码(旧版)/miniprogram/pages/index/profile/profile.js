Page({
  data: {
    currentIndex: -1,   // 当前展开的卡片索引（默认全部收起）

    cards: [
      { icon: "👤", title: "关于我" },
      { icon: "💼", title: "工作经历" },
      { icon: "🎓", title: "教育背景" },
      { icon: "🌐", title: "技能" },
      { icon: "🈳", title: "语言" },
      { icon: "🏅", title: "荣誉" },
    ]
  },

  // 点击展开 / 收起
  toggleCard(e) {
    const index = e.currentTarget.dataset.index;

    this.setData({
      currentIndex: this.data.currentIndex === index ? -1 : index
    });
  }
})
