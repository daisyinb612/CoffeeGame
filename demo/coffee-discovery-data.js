// u and y are fractions of the accepted panorama: x from left, y from top.
// photo uses a source photograph, not the lower-resolution generated panorama.
export const ITEMS = [
  {id:'espresso',name:'意式咖啡机',category:'咖啡设备',area:'制作台',u:.208,y:.604,photo:['coffee-bar.jpg',.50,.65],summary:'制作浓缩咖啡的主要设备。',use:'把装好咖啡粉的手柄装在冲煮头上，咖啡机会用热水萃取浓缩咖啡。',tip:'冲煮头和蒸汽棒可能很烫。先跟着老师学习操作。'},
  {id:'grinders',name:'磨豆机',category:'咖啡设备',area:'制作台',u:.272,y:.579,photo:['coffee-bar.jpg',.75,.64],summary:'把咖啡豆磨成咖啡粉。',use:'上面的透明豆仓装咖啡豆，研磨后的咖啡粉从出粉口落入容器或手柄。',tip:'研磨时把手指和工具放在机器外面，调整时先问老师。'},
  {id:'ice-maker',name:'制冰机',category:'备料设备',area:'制作台',u:.145,y:.582,photo:['coffee-bar.jpg',.31,.62],summary:'为冷饮准备冰块。',use:'制作冰美式等冷饮时，可以用冰铲从制冰机中取冰。',tip:'用干净的冰铲取冰，取完把冰铲放回指定位置。'},
  {id:'sink',name:'水槽',category:'清洁用品',area:'制作台左边',u:.070,y:.648,photo:['coffee-bar.jpg',.12,.77],summary:'清洗杯具和工具的地方。',use:'使用后的杯具和工具放到指定清洗区，按照店里的清洗步骤处理。',tip:'洗手和洗器具按店里的区域安排进行，台面积水及时擦干。'},
  {id:'mugs',name:'挂杯与奶缸',category:'咖啡器具',area:'置物架',u:.141,y:.448,photo:['coffee-bar.jpg',.35,.37],summary:'置物架上有杯子和金属奶缸。',use:'杯子用来盛饮品，奶缸可用于准备牛奶。按要制作的饮品选择对应器具。',tip:'用前看一看是否干净，取放时握稳把手。'},
  {id:'beans',name:'咖啡与茶的原料区',category:'原料收纳',area:'置物架上方',u:.134,y:.356,photo:['coffee-bar.jpg',.34,.25],summary:'制作饮品需要先找到对应原料。',use:'这里的置物架收纳了不同包装的原料。制作前先核对包装名称和课程要求。',tip:'图片不能确定每个包装里的内容；拿不准时，请老师帮忙确认。'},
  {id:'cloths',name:'清洁布',category:'清洁用品',area:'制作台边缘',u:.135,y:.726,photo:['coffee-bar.jpg',.28,.86],summary:'清洁台面和工作区会用到。',use:'不同区域的布分开使用，工作结束后按要求清洗、放好。',tip:'颜色只是图片中的外观，用途要按店里的规定确认。'},
  {id:'back-machine',name:'背面咖啡机',category:'咖啡设备',area:'背面工作台',u:.572,y:.566,photo:['lounge.jpg',.24,.62],summary:'另一侧工作台上的白色咖啡机。',use:'它也用于咖啡制作。先认识它的位置，再跟老师学习这台设备的具体操作。',tip:'不同机器的开关和程序可能不同，不直接照搬另一台的操作。'},
  {id:'cup-cabinet',name:'杯具展示柜',category:'器具收纳',area:'背面工作台右边',u:.716,y:.647,photo:['lounge.jpg',.77,.75],summary:'收纳杯子、杯碟和玻璃器具。',use:'制作饮品前，可以到这里找到相应杯具；清洗和干燥后放回指定位置。',tip:'玻璃杯轻拿轻放，发现裂口或缺角时先告诉老师。'},
  {id:'fridge',name:'冰箱',category:'备料设备',area:'门口旁',u:.478,y:.584,photo:['back-room.jpg',.64,.57],summary:'保存需要冷藏的原料。',use:'需要冷藏的饮品原料按门店要求分类放置。取用后及时关好门。',tip:'先确认要取什么，包装和保存要求不清楚时问老师。'},
  {id:'door',name:'出入口',category:'环境认识',area:'门口',u:.397,y:.544,photo:['back-room.jpg',.47,.55],summary:'进出这个工作区的位置。',use:'先记住出入口在哪里，进出时看看周围有没有人或物品。',tip:'门口和通道要保持畅通，端着饮品时慢慢走。'},
  {id:'window',name:'窗户',category:'环境认识',area:'左侧',u:.876,y:.508,photo:['sink.jpg',.45,.43],summary:'帮助你辨认工作区的方向。',use:'窗户在门口的相对一侧。记住窗户和门的位置，转身后更容易知道自己朝向哪里。',tip:'需要开关窗户或调窗帘时，先按店里的安排操作。'},
];

export function panoramaVector(THREE,u,y,radius=20){
  const angle=(u-.125)*Math.PI*2,latitude=(.5-y)*Math.PI;
  return new THREE.Vector3(Math.sin(angle)*Math.cos(latitude)*radius,Math.sin(latitude)*radius,-Math.cos(angle)*Math.cos(latitude)*radius);
}
