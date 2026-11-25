// Original video seconds, cross-referenced against final.reviewed.json.
// choices marks the correct option with a null hint. Use an on-frame swipe for S133–S137.
export const checkpoints = [
  { at: 39.35, phase: 0, title: "认器具与吸管", ref: "S5–S16",
    prompt: "在刚才的准备阶段，有拿出来或摆好这件物品吗？",
    inventory: [
      { name: "直筒玻璃杯", photo: "glass", needed: true, hint: "回想刚才从玻璃柜里拿出的杯子。" },
      { name: "托盘", photo: "tray", needed: false, hint: "做好冰美式后，才会用托盘出品。" },
      { name: "长柄搅拌棒", photo: "spoon", needed: true, hint: "回想刚才放在玻璃杯右边的长柄器具。" },
      { name: "带柄量杯", photo: "measuring-cup", needed: true, hint: "回想刚才放在大玻璃杯前面、带深色短柄的小杯子。" },
      { name: "压粉锤", photo: "tamper", needed: false, hint: "压粉锤在准备咖啡粉时才会用到。" },
      { name: "带包装的吸管", photo: "straw", needed: true, hint: "回想刚才放在咖啡机顶部的细长白色包装。" },
    ],
    rounds: [
      { prompt: "带包装的吸管放在哪里备用？", choices: [
        ["沥水盘", "吸管放在咖啡机顶部。下方的沥水盘用来接水。", "preparation/drip-tray"],
        ["温杯区", null, "preparation/warm-rack"],
      ] },
    ] },
  { at: 89.1, phase: 0, title: "准备量杯和搅拌棒", ref: "S14–S16、S21–S34",
    prompt: "量杯和搅拌棒冲洗后，怎样收好？",
    rounds: [
      { prompt: "量杯和搅拌棒冲洗后，怎样收好？", choices: [
        ["直接放回", "杯具上还有水。回想口布擦过杯口和勺柄的动作。", "preparation/warm-rack"],
        ["先用口布擦干", null, "preparation/cup-cloth"],
      ] },
      { prompt: "擦干后，两件都放在哪里？", choices: [
        ["咖啡机顶部的温杯区", null, "preparation/warm-rack"],
        ["咖啡机下方的沥水盘", "沥水盘在下面，用来接水。找机顶放着器具的格栅。", "preparation/drip-tray"],
      ] },
    ] },
  { at: 107.12, phase: 0, title: "洗杯与擦干", ref: "S18–S20、S36–S37",
    prompt: "刚才拿到玻璃杯后，先做了什么？",
    rounds: [
      { prompt: "刚才拿到玻璃杯后，先做了什么？", choices: [
        ["用清水冲洗", null, "preparation/cup-rinse"],
        ["直接擦干", "先用清水冲过杯口和杯内，再用口布擦干。", "preparation/cup-wipe"],
      ] },
      { prompt: "冲洗完，用哪块布擦干杯子？", choices: [
        ["灰色抹布", "灰色抹布用来擦手。回想刚才贴在杯口的白色口布。", "preparation/gray-cloth"],
        ["口布", null, "preparation/cup-cloth"],
      ] },
    ] },
  { at: 133.6, phase: 0, title: "洗手与擦手", ref: "S42–S45",
    prompt: "刚才先做了什么？",
    rounds: [
      { prompt: "刚才先做了什么？", choices: [
        ["用流水洗手", null, "preparation/hands-wash"],
        ["直接擦手", "先用流水把手洗干净，再擦干。", "preparation/hands-wipe"],
      ] },
      { prompt: "洗好了。用哪块布擦干双手？", choices: [
        ["口布", "口布用来擦干杯具。这里要擦的是双手。", "preparation/cup-cloth"],
        ["灰色抹布", null, "preparation/gray-cloth"],
      ] },
    ] },
  { at: 184.7, ref: "S47–S63", phase: 1, title: "冰杯预处理", prompt: "这杯要加多少冰？", game: "ice-scoop",
    rounds: [
      { prompt: "哪一杯冰可以拿去接水？", illustrated: true, choices: [
        ["A 杯", "冰已经堆过杯口了。找一杯冰接近杯口、没有堆出来的。", "ice/ice-heaped", "冰堆过杯口"],
        ["B 杯", "这杯只有大约半杯冰。用冰铲把冰加到约满杯。", "ice/ice-half", "冰只有半杯"],
        ["C 杯", null, "ice/ice-full", "冰接近杯口，仍在杯里"],
      ] },
      { prompt: "哪一杯冰水可以放在旁边备用？", illustrated: true, choices: [
        ["A 杯", "这杯太满了。看冰和水的整体高度，杯口下面要留一小段空间。", "ice/water-near-rim", "冰水快到杯口"],
        ["B 杯", null, "ice/water-eight", "冰水高度约八分满"],
        ["C 杯", "这杯只有大约半杯。把冰和直饮水一起看，整体到八分满。", "ice/water-half", "冰水高度约一半"],
      ] },
      { prompt: "杯子放稳了。哪一杯周围还是干净的？", illustrated: true, choices: [
        ["A 杯", null, "ice/water-eight", "杯周没有冰块或水迹"],
        ["B 杯", "杯旁有一摊水。接到八分满就停，慢一点把杯子移开。", "ice/check-water", "杯旁有水迹"],
        ["C 杯", "杯旁有散落的冰。取冰时把冰铲对准杯口，再慢慢倒进去。", "ice/check-ice", "杯旁有散落的冰块"],
      ] },
    ] },
  { at: 206.2, ref: "S65–S71", phase: 2, title: "清洁粉碗", prompt: "接粉前，怎么把粉碗洗干净？",
    rounds: [
      { prompt: "接粉前，怎么把粉碗洗干净？", choices: [
        ["用冲煮头的水冲洗", null, "handle/basket-rinse"],
        ["直接用抹布擦", "先让冲煮头出水，冲洗粉碗内侧，再用布擦干。", "handle/basket-brown-cloth"],
      ] },
      { prompt: "粉碗洗好了。拿哪块抹布擦干？", choices: [
        ["蓝色抹布", "蓝色抹布擦沥水盘。粉碗用咖啡色抹布。", "handle/tray-blue-cloth"],
        ["咖啡色抹布", null, "handle/basket-brown-cloth"],
      ] },
    ] },
  { at: 289.85, ref: "S79–S95", phase: 2, title: "去皮与称粉", prompt: "用电子秤称出 18 克咖啡粉。", game: "handle-scale" },
  { at: 298.55, ref: "S96–S99", phase: 2, title: "布粉", prompt: "把粉碗里的咖啡粉铺平。", game: "handle-distribution" },
  { at: 305.25, ref: "S100–S103", phase: 2, title: "压粉", prompt: "用压粉锤把粉面压实。", game: "handle-tamp" },
  { at: 311.35, ref: "S103–S105", phase: 2, title: "清理残粉", prompt: "手柄外缘有残粉，怎么处理？", game: "handle-grounds" },
  { at: 331, ref: "S106–S110", phase: 6, title: "空排水与擦拭", prompt: "空排水 3 秒，再用蓝色抹布擦沥水盘。", game: "extract-flush" },
  { at: 342.5, ref: "S111–S115、S117", phase: 6, title: "量杯去皮与就位", prompt: "量杯上秤去皮，再把秤和杯一起放到冲煮头下。", game: "extract-tare" },
  { at: 400, ref: "S116–S128", phase: 6, title: "挂手柄与萃取", prompt: "挂好手柄后，5 秒内开始萃取。", game: "extract-brew" },
  { at: 428, ref: "S129–S138", phase: 3, title: "调配与搅拌操作", score: 2,
    prompt: "按刚才的示范完成调配与搅拌，共 2 分。", game: "mix-stir",
    rounds: [
      { prompt: "浓缩液要倒到哪里？", choices: [
        ["倒入备好的冰水玻璃杯", null, "inventory/glass"],
        ["倒在空量杯里", "冰水杯已经备好，要把萃取好的浓缩液倒入杯中。", "preparation/cup-rinse"],
      ] },
      { prompt: "倒入后怎样让咖啡液和冰水均匀？", choices: [
        ["用搅拌棒搅拌均匀", null, "inventory/spoon"],
        ["静置等待分层", "用搅拌棒充分搅拌，让咖啡液和冰水混合均匀。", "ice/water-eight"],
      ] },
      { prompt: "使用后的搅拌棒放在哪里？", choices: [
        ["放在水槽中", null, "preparation/cup-rinse"],
        ["放到顾客托盘里", "托盘上的器具会交给顾客；用过的搅拌棒要放入水槽。", "inventory/tray"],
      ] },
    ] },
  { at: 449.5, ref: "S139–S148", phase: 4, title: "成品与摆盘出品",
    prompt: "检查杯身和托盘，再把冰美式和配件摆好。", game: "service-tray" },
  { at: 452, ref: "S149 · 原声 07:35.3–07:41.2", phase: 4, title: "出品服务表达",
    prompt: "递上冰美式时，你会怎么对顾客说？", game: "service-speech" },
  { at: 565, ref: "S154–S185", phase: 5, title: "清洁器具",
    prompt: "把用过的器具清洁干净。", game: "cleanup-tools" },
  { at: 597, ref: "S197–S199", phase: 5, title: "清洁工作台面",
    prompt: "用蓝色抹布擦净工作台面。", game: "cleanup-counter" },
  { at: 599.2, ref: "S164、S181–S187、S195–S200", phase: 5, title: "工具归位与工作台复位",
    prompt: "把清洁后的工具放回规定位置。", game: "cleanup-reset" },
];
