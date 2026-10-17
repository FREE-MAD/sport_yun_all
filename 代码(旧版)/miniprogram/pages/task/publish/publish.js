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
      participant_count: 1, // Number of participants
      group_rules: '',
      contact: '',
      coach_id: '', // New: Specified Coach ID
      accept_group: true,
    },
    showCover: false,
    categoryList: ['体育', '家教', '陪练', '其他'],
    participantOptions: ['1人', '2人', '3人', '4人', '5人', '6人', '7人', '8人', '9人', '10人', '10人以上'],
    priceOptions: ['不同地区不同' , '100-130', '130-160', '160-190', '190-220', '220-250', '250以上'],
    publishType: '附近课程', // Default tab
    nearbyList: [], // Nearby courses list

    // Class Selection Data
    classTypes: [ 
        { 
          id: 'posture', 
          name: '体态矫正', 
          brief: '专门针对青少年中常见的圆肩、驼背、X/O型腿等问题设计的专项训练。通过一系列定制化的训练计划，帮助孩子改善不良体态，促进健康成长', 
          defaultLessons: 12, 
          images: [], 
          planText: '一期 12 节：前 3 节进行体态评估与基础动作学习，中间 6 节重点训练肩颈、脊柱、下肢的稳定与拉伸，最后 3 节形成家庭可执行的体态改善方案并跟踪效果。', 
          subItems: ['圆肩驼背改善', '脊柱侧弯预防', 'X/O 型腿调整'], 
          subPlans: { 
            '圆肩驼背改善': '本子计划聚焦于现代青少年因久坐、低头使用电子设备导致的圆肩驼背问题。通过胸椎伸展、肩胛激活及颈部放松训练，帮助打开上背部、恢复自然肩颈曲线；中间引入弹力带抗阻训练、墙面贴靠站立练习等方法，强化深层稳定肌群，建立正确的静态与动态站姿习惯；最后根据孩子日常学习和生活场景，量身定制一套可在家中轻松执行的5–10分钟纠正操，并提供动作打卡表与视频指导，确保效果可持续。', 
  
  
            '脊柱侧弯预防': '针对脊柱发育关键期可能出现的轻度功能性侧弯，本计划强调早期筛查与干预。通过评估（如Adam前屈测试、体表标志观察）判断脊柱力线是否对称，并检测左右侧核心肌群力量差异；围绕躯干旋转控制、单侧臀肌与背肌激活展开系统训练，采用瑞士球、平衡垫等器械提升本体感觉与对称发力能力；重点培训家长掌握居家观察要点（如双肩高度、骨盆倾斜等），并教授简单辅助拉伸与提醒技巧，形成联动干预机制。', 
  
  
            'X/O 型腿调整': 'X型腿（膝外翻）或O型腿（膝内翻）多与髋关节稳定性不足、足弓塌陷或走路姿势异常相关。本计划着重训练髋外展肌群（如臀中肌）控制力，引导孩子感知下肢正确对线；结合功能性动作如深蹲、弓步走、弹力带侧向行走等，强化膝关节周围肌肉协同工作能力；最后将分析孩子的日常站姿、坐姿及步态，制定个性化行为调整建议（如避免W坐姿、选择合适鞋垫等），并搭配家庭训练包，巩固课堂成果。          ' 
          } 
        }, 
        { 
          id: 'elite', 
          name: '专业追高', 
          brief: '提高专项成绩，适合有一定基础、想要突破的孩子', 
          defaultLessons: 16, 
          images: [], 
          planText: '一期 16 节：前 4 节基础体能与动作技术复盘，中间 8 节进行专项速度、力量、灵敏等强化训练，最后 4 节侧重专项测试与比赛模拟，帮助冲击更高水平。', 
          subItems: ['基础能力巩固', '专项成绩突破', '考级与比赛冲刺'], 
          subPlans: { 
            '基础能力巩固': '本子计划旨在为高水平专项训练筑牢体能根基。围绕全身力量发展（尤其下肢爆发力与核心抗旋能力）、动态柔韧性（如主动腿摆、髋关节活动度）及神经肌肉协调性展开系统训练，在确保动作模式标准的前提下，逐步提升训练强度与耐力水平；通过复合式动作组合与多方向移动练习，全面提升运动表现的稳定性、效率与抗疲劳能力，为后续突破打下坚实基础。', 
            '专项成绩突破': '本计划以精准诊断为核心，通过阶段性测试识别技术瓶颈与体能短板（如起跑反应慢、途中跑节奏紊乱、落地缓冲不足等）。针对弱项进行技术细化与专项体能强化，例如优化蹬伸角度、提升步频控制、增强乳酸耐受能力等；同时融入高强度间歇与模拟实战情境，逐步提高单位时间内的动作输出质量，帮助孩子实现从“练得好”到“赛得出”的关键跨越。', 
            '考级与比赛冲刺': '本计划紧密对标体育特长生考级、校队选拔或市级赛事评分标准，融合技术、体能与心理三大维度。安排全真模拟测试、分段节奏策略演练及临场心理调节训练（如压力应对、专注力聚焦）；在冲刺阶段集中进行全流程模拟——从热身流程、检录候场到正式测试与赛后恢复，均由教练按真实考场要求组织，并辅以视频复盘与细节打磨，全面提升应试信心与实战发挥稳定性。          ' 
          } 
        }, 
        { 
          id: 'track', 
          name: '田径专项', 
          brief: '100/200 等中长跑、跑跳投综合训练', 
          defaultLessons: 16, 
          images: [], 
          planText: '一期 16 节：前 4 节学习跑姿、起跑与节奏控制，中间 8 节分模块训练短跑速度、中长跑耐力和跑跳投基础技术，最后 4 节进行全项目综合练习与测试。', 
          subItems: ['短跑爆发力', '中长跑耐力', '跑跳投综合训练'], 
          subPlans: { 
            '短跑爆发力': '本计划聚焦100米、200米等短距离项目的核心能力——瞬间加速与高速维持。通过起跑反应训练、前30米蹬伸技术优化及途中跑躯干姿态控制，打造高效跑动模式；结合跨步跳、上坡冲刺、阻力伞跑等手段提升后蹬力量与步频协调性；同时利用视频分析逐帧纠正“坐着跑”“摆臂幅度过小”等常见错误，构建经济、快速、稳定的短跑技术体系。', 
            '中长跑耐力': '本计划面向800米及以上项目，强调有氧能力与节奏感的协同发展。采用间歇跑、变速节奏跑与匀速耐力跑相结合的方式，循序渐进提升最大摄氧量与乳酸阈值；同步教授腹式呼吸技巧、步频调控策略及心理分段法（如“每200米设定小目标”），帮助孩子找到个人最佳配速节奏，避免因战术失误导致后程乏力，实现全程匀速甚至后程加速的理想状态。', 
            '跑跳投综合训练': '在稳固基本跑姿基础上，拓展田径基础技能模块。跳远训练注重助跑与起跳的衔接连贯性、空中收腹举腿姿态控制；立定跳远侧重下肢快速伸缩复合能力（SSC）的激发；实心球投掷则从蹬地转髋到鞭打出手进行动力链整合教学。所有内容均强调上下肢协调发力与核心传导效率，为未来参与全能项目或多方向运动发展奠定扎实技术基础。          ' 
          } 
        }, 
        { 
          id: 'exam', 
          name: '中考体育', 
          brief: '围绕中考项目进行系统训练与模拟测试', 
          defaultLessons: 20, 
          images: [], 
          planText: '一期 20 节：针对中考各项（如长跑、跳绳、实心球等）进行专项拆解练习，前 5 节打基础，中间 10 节逐项提升成绩，最后 5 节按照中考流程进行全真模拟与应试策略指导。', 
          subItems: ['长跑专项', '跳绳专项', '实心球专项'], 
         subPlans: { 
           '长跑专项': '本计划围绕中考1000米（男）/800米（女）项目，系统提升有氧耐力与跑步经济性。通过节奏跑、间歇跑与呼吸配合训练，帮助学生建立稳定配速策略；结合体能短板分析（如核心不稳、步幅过大），针对性优化跑姿，减少能量浪费；后期融入模拟测试与心理调适，确保考试当天发挥稳定、避免“撞墙”。', 
           '跳绳专项': '本计划面向800米及以上项目，强调有氧能力与节奏感的协同发展。采用间歇跑、变速节奏跑与匀速耐力跑相结合的方式，循序渐进提升最大摄氧量与乳酸阈值；同步教授腹式呼吸技巧、步频调控策略及心理分段法（如“每200米设定小目标”），帮助孩子找到个人最佳配速节奏，避免因战术失误导致后程乏力，实现全程匀速甚至后程加速的理想状态。', 
           '实心球专项': '本计划聚焦实心球投掷的技术链条优化，从握球姿势、下肢蹬伸、转髋送肩到最后鞭打出手，逐环节打磨发力顺序与协调性；通过轻重球交替训练、标志物目标投掷等方式提升出手速度与方向控制；同时结合核心抗旋与肩部柔韧性练习，预防运动损伤，确保动作既规范又具爆发力。 ' 
         } 
       }, 
       { 
         id: 'kids_fitness', 
         name: '少儿体能班', 
         brief: '提升整体体能与协调性，增强自信心', 
         defaultLessons: 12, 
         images: [], 
         planText: '一期 12 节：以游戏化形式提升孩子的跑、跳、爬、钻、平衡等基础体能，培养良好运动习惯和专注力，让孩子在快乐中爱上运动。', 
         subItems: ['基础体能', '协调性训练', '平衡能力'], 
         subPlans: { 
           '基础体能': '通过趣味障碍跑、动物模仿爬行、追逐游戏等形式，全面提升儿童的力量、速度、耐力与灵活性；所有动作设计符合儿童生长发育特点，避免过早专项化，在快乐中自然发展基础运动能力。', 
           '协调性训练': '借助多方向变向跑、手脚配合钻爬、节奏踏步等游戏化任务，刺激大脑与肢体的协同工作能力；通过非对称动作、交叉模式练习（如对侧手脚同步）促进神经通路发育，为未来学习复杂运动技能打下基础。', 
           '平衡能力': '利用平衡木、软垫、单脚站立挑战等器材与情境，训练静态与动态平衡控制；结合闭眼站立、抛接球等干扰任务，提升前庭系统与本体感觉整合能力，有效预防跌倒，增强运动安全感与自信心。 ' 
         } 
       }, 
       { 
         id: 'rope', 
         name: '跳绳班', 
         brief: '跳绳基础与花样技巧训练，兼顾兴趣与考试', 
         defaultLessons: 12, 
         images: [], 
         planText: '一期 12 节：从单摇、双摇等基础节奏入手，逐步加入交叉跳、花样跳等技巧训练，同时结合学校考试要求，提升速度与耐力。', 
         subItems: ['基础跳绳', '速度跳绳', '花样跳绳'], 
         subPlans: { 
           '基础跳绳': '从正确握绳、手腕摇动、双脚轻跳等基本要素入手，建立规范的单摇节奏；通过地面标记、节拍音乐辅助，帮助孩子掌握稳定、省力的跳绳模式，为后续提速与花样打下技术基础。', 
           '速度跳绳': '借助多方向变向跑、手脚配合钻爬、节奏踏步等游戏化任务，刺激大脑与肢体的协同工作能力；通过非对称动作、交叉模式练习（如对侧手脚同步）促进神经通路发育，为未来学习复杂运动技能打下基础。', 
           '花样跳绳': '引入交叉跳、开合跳、弓步跳、双摇等基础花样动作，培养手脚协调与节奏变化能力；通过组合编排与音乐配合，激发创造力与表现欲，让跳绳从“考试项目”转变为“兴趣特长”。 ' 
         } 
       }, 
       { 
         id: 'ball', 
         name: '球类专项班', 
         brief: '乒乓球、羽毛球、篮球、足球等专项兴趣培养', 
         defaultLessons: 16, 
         images: [], 
         planText: '一期 16 节：根据孩子选择的球类项目，从基本握拍、运球、传接球等动作教起，配合分组对抗、小比赛，提高技术的同时培养团队意识与规则意识。', 
         subItems: ['乒乓球', '羽毛球', '篮球', '足球'], 
         subPlans: { 
           '乒乓球': '从握拍方式、基本站位、正反手推挡与攻球教起，逐步过渡到发球、接发与简单对打；通过多球训练提升反应速度与击球稳定性，结合小游戏培养球感与专注力，打好入门技术框架。', 
           '羽毛球': '重点训练握拍转换、高远球挥拍轨迹、步法移动（如并步、交叉步）及网前搓放技术；通过定点多球与半场对抗，提升控球能力与场上覆盖意识，激发对隔网对抗项目的兴趣。', 
           '篮球': '从持球姿势、原地运球、传接球准确性开始，逐步加入行进间运球、三步上篮、基础防守滑步等内容；通过2v2、3v3小比赛培养团队配合意识、规则理解与比赛阅读能力。 ', 
           '足球':'围绕脚内侧传球、停球、带球变向、射门等核心技能展开训练；结合绕杆、传准、小型对抗赛等形式，提升球感、空间感知与协作能力，在实战中体验足球乐趣。' 
         } 
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

      // 获取当前位置用于计算距离
      let userLoc = app.globalData.userLocation;
      console.log('[publish_pdd] [fetchNearbyList] 当前用户位置(globalData):', userLoc);

      const doFetch = (currentLoc) => {
        console.log('[publish_pdd] [fetchNearbyList] 准备发起云函数调用, 使用位置:', currentLoc);

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
            const list = res.result.data.map((item, index) => {
              if (!item._id) console.warn('[publish_pdd] [fetchNearbyList] 警告: item 缺少 _id:', item);
              
              let distanceStr = '未知距离';
              // 详细日志：检查每个条目的位置信息
              console.log(`[publish_pdd] [Item ${index}] 数据结构 keys:`, Object.keys(item));
              if (index < 3 || (!item.latitude && !item.longitude)) {
                  console.log(`[publish_pdd] [Item ${index}] 完整数据:`, item);
              }

              // 优先从顶层获取经纬度（新逻辑），兼容 submitForm（旧逻辑或误判）
              const lat = item.latitude || (item.submitForm && item.submitForm.latitude);
              const lng = item.longitude || (item.submitForm && item.submitForm.longitude);
              
              const itemLoc = (lat && lng) ? { lat, lng } : null;

              if (currentLoc && itemLoc) {
                  distanceStr = this.calculateDistance(currentLoc.latitude, currentLoc.longitude, itemLoc.lat, itemLoc.lng);
                  console.log(`[publish_pdd] [Item ${index}] 距离计算成功: ${distanceStr} (用户: ${currentLoc.latitude},${currentLoc.longitude} -> 目标: ${itemLoc.lat},${itemLoc.lng})`);
              } else {
                  console.warn(`[publish_pdd] [Item ${index}] 无法计算距离. 详情:`, {
                      userLoc: currentLoc,
                      itemLoc: itemLoc,
                      rawLat: lat,
                      rawLng: lng,
                      hasSubmitForm: !!item.submitForm
                  });
              }

              return {
                id: item._id,
                // avatar: item.userInfo?.avatarUrl || '/images/icons/avatar.png',
                name: item.userInfo?.nickName || '家长',
                desc: item.title || item.description || '可进入',
                distance: distanceStr
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
      };

      // 如果没有位置，尝试获取
      if (!userLoc) {
          console.log('[publish_pdd] [fetchNearbyList] globalData无位置信息，尝试wx.getLocation...');
          wx.getLocation({
              type: 'wgs84',
              success: (res) => {
                  console.log('[publish_pdd] [fetchNearbyList] wx.getLocation成功:', res);
                  userLoc = { latitude: res.latitude, longitude: res.longitude };
                  // 更新全局数据，避免重复获取
                  app.globalData.userLocation = userLoc;
                  doFetch(userLoc);
              },
              fail: (err) => {
                  console.error('[publish_pdd] [fetchNearbyList] wx.getLocation失败:', err);
                  doFetch(null);
              }
          });
      } else {
          doFetch(userLoc);
      }
  },

  // 计算距离
  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return '未知距离';
    const R = 6371; // 地球半径 km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // 距离 km
    if (d < 1) return (d * 1000).toFixed(0) + 'm';
    return d.toFixed(1) + 'km';
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

  onParticipantCountChange(e) {
    const index = parseInt(e.detail.value);
    const count = index >= 10 ? 11 : index + 1; // 10人以上视为11(或更多)
    this.setData({
      'form.participant_count': count
    });
  },

  onPriceChange(e) {
    this.setData({
      'form.price_interval': this.data.priceOptions[e.detail.value]
    });
  },
  
  // Select a class
  onSelectClass(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.currentClassId) return;

    const cls = this.data.classTypes.find(c => c.id === id);
    this.setData({
      currentClassId: id,
      currentClass: cls,
      selectedSubName: null // Reset sub-selection
    });

    // Auto-fill form description
    this.setData({
      'form.category': cls.name,
      'form.title': `寻找${cls.name}相关教练/陪练`,
      'form.description': `我想学习${cls.name}，${cls.brief}。`
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
      // Frequency validation removed
      if (!rawForm.participant_count || rawForm.participant_count < 1) {
        wx.showToast({ title: '请填写参与人数', icon: 'none' });
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
