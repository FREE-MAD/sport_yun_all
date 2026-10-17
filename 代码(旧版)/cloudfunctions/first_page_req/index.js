const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-6gh7jgl8c5b16a83' });

const db = cloud.database();

function formatTime(createTime) {
  const now = Date.now();
  const time = new Date(createTime).getTime();
  const diff = now - time;
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return Math.floor(diff / minute) + '分钟前';
  if (diff < day) return Math.floor(diff / hour) + '小时前';
  if (diff < 7 * day) return Math.floor(diff / day) + '天前';

  const date = new Date(createTime);
  return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  try {
    // 并行获取三个集合数据
    const [jobsRes, eventsRes, hotRes] = await Promise.all([
      db.collection('atfirst_req').get(),
      // db.collection('events').get(),
      // db.collection('hot').get()
    ]);

    const sections = [
      { 
        id: 'jobs', 
        title: '体育兼职', 
        posts: jobsRes.data.map(post => ({ ...post, displayTime: formatTime(post.createTime) })) 
      },
      { 
        id: 'events', 
        title: '体育大事件', 
        posts: eventsRes.data.map(post => ({ ...post, displayTime: formatTime(post.createTime) })) 
      },
      { 
        id: 'Questionnaire', 
        title: '健康问卷', 
        posts: hotRes.data.map(post => ({ ...post, displayTime: formatTime(post.createTime) })) 
      }
    ];

    return { sections, openid: wxContext.OPENID };

  } catch (err) {
    return { error: err.message };
  }
};
