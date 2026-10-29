/* 复习端 · 精讲与练习数据 —— 随仓库发布，运行时由 review.js 读取
 * 每道题包含：strategy 思路精讲 / knowledge 知识点 / code 参考代码（可在编辑器运行）/
 *            complexity 复杂度 / pitfalls 易错点 / walk 样例手算 / practice 自测与变式
 * 全部 code 均已在模拟器 VM 中实测通过该题所有测试点（digit 因需 64 位运算走解释器）。
 */
window.REVIEWS = {
  "queue": {
    "strategy": "题意：对每个同学 i，统计他<b>右边</b>有多少人比他高（严格大于）。这是一道「按位置统计右侧信息」的题型，最直接的思路就是：对每个 i，把 j 从 i+1 扫到 n，遇到 h[j] > h[i] 就计数。<br>关键判断：<b>要不要优化？</b>看数据范围——n ≤ 500，双重循环约 1.2×10⁵ 次比较，在 2 秒时限内完全够用。所以这题的正解就是暴力 O(n²)，不要为了炫技去写树状数组。<br>如果 n 提高到 10⁵，暴力会变成 10¹⁰ 次必然超时，那时才需要「从右往左 + 树状数组/归并排序」统计「右侧比它大的个数」，本质和逆序对是同一个模型。这就是「按数据范围选算法」的典型例子。",
    "knowledge": [
      "双重循环统计：外层枚举 i，内层枚举 j > i，O(n²) 在 n ≤ 500 下可行。",
      "严格大于 vs 大于等于：题目要求「严格大于」，判断必须写 h[j] > h[i]，用 >= 会把等高的人也算进去。",
      "按行输出：每个人一行，共 n 行，注意换行位置。",
      "规模升级的应对：n 到 10⁵ 时用树状数组或归并排序统计右侧更大值，复杂度 O(n log n)。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint h[2005];\n\nint main(){\n    int n;\n    cin >> n;\n    for (int i = 1; i <= n; i++) cin >> h[i];\n\n    for (int i = 1; i <= n; i++){\n        int cnt = 0;\n        for (int j = i + 1; j <= n; j++)\n            if (h[j] > h[i]) cnt++;\n        cout << cnt << \"\\n\";\n    }\n    return 0;\n}",
    "complexity": "时间 O(n²)（n ≤ 2000 时约 2×10⁶ 次比较，安全），空间 O(n) 存身高。",
    "pitfalls": [
      "内层循环必须从 i+1 开始，从 1 开始就把左边的人也算进去了。",
      "比较必须是严格大于 h[j] > h[i]；身高可以相等，等高的不算「比他高」。",
      "身高最大 10⁹，用 int 存没问题（int 约 2×10⁹），不需要 long long。",
      "输出是 n 行，不是一行，别把 cnt 都拼在同一行输出。"
    ],
    "walk": "样例 5 人，身高 180 175 190 175 180：<br>第 1 人 180 → 右边 190、180 中严格更大的只有 190 → 1<br>第 2 人 175 → 右边 190、180 都更大 → 2<br>第 3 人 190 → 右边没人更高 → 0<br>第 4 人 175 → 右边 180 更大 → 1<br>第 5 人 180 → 右边没人 → 0<br>输出 1 2 0 1 0，与样例一致。",
    "practice": [
      {
        "q": "如果 n 提高到 10⁵，O(n²) 会怎样？该怎么改？",
        "hint": "10¹⁰ 次比较必然超时。做法：从右往左扫，用树状数组维护「已出现过的身高」的计数，每次查询「比 h[i] 大的个数」；因为身高可达 10⁹，需要先离散化。"
      },
      {
        "q": "如果题目改成「右边身高不小于他的人有多少个」，代码改哪里？",
        "hint": "只需把 h[j] > h[i] 改成 h[j] >= h[i]。注意此时等高的人也要计入，样例答案会全部变大。"
      },
      {
        "q": "为什么这题不需要 long long？",
        "hint": "答案最大是 n-1 ≤ 1999，身高最大 10⁹ 也在 int 范围内（约 2.1×10⁹），都没有溢出风险。"
      }
    ]
  },
  "decode": {
    "strategy": "题意：密文是一串数字 1~9，每个数字可以单独解码成一个字母（1→A、2→B … 9→I），相邻两个数字也可以合并成一个两位数解码（该数必须 ≤ 26），问一共有多少种解码方式。<br>这是<b>计数型 DP</b>的入门模型，状态定义很自然：<code>dp[i]</code> 表示「前 i 个数字有多少种解码方案」。转移看第 i 个数字怎么处理：<br>① <b>单独解码</b>：它自己是一个 1~9 的数，必然合法，贡献 <code>dp[i-1]</code>；<br>② <b>与前一个合并</b>：若 <code>i ≥ 2</code> 且两位组成的数在 10~26 之间，贡献 <code>dp[i-2]</code>。<br>两者相加就是 <code>dp[i]</code>，答案取 <code>dp[n]</code>，全程对 10⁹+7 取模。<br>边界：<code>dp[0] = 1</code>（空串算一种方案，这是为了让 i=2 时能正确加上 dp[0]）。",
    "knowledge": [
      "计数型 DP：dp[i] 表示前缀长度为 i 的方案数，答案在 dp[n]。",
      "两类转移：单独成字母（dp[i-1]）与两位合并（dp[i-2]），互不重叠故可直接相加。",
      "两位合法性判断：数值在 10~26 之间（题目数据保证是 1~9，所以只需判断 ≤ 26）。",
      "取模：每步都 % 1000000007，防止溢出；dp 用 int 即可。",
      "边界 dp[0] = 1：空串视为一种方案，这是计数 DP 的常见约定。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nconst int MOD = 1000000007;\nint d[2005];\nint dp[2005];\n\nint main(){\n    int n = 0;\n    char c;\n    while (cin >> c) d[n++] = c - '0';   // 逐字符读入，避开字符数组下标问题\n\n    dp[0] = 1;\n    for (int i = 1; i <= n; i++){\n        dp[i] = dp[i-1];                 // 单独解码\n        if (i >= 2){\n            int two = d[i-2] * 10 + d[i-1];\n            if (two >= 10 && two <= 26)\n                dp[i] = (dp[i] + dp[i-2]) % MOD;\n        }\n    }\n    cout << dp[n] << \"\\n\";\n    return 0;\n}",
    "complexity": "时间 O(n)，每个位置常数次运算；空间 O(n)。n ≤ 2000，毫无压力。",
    "pitfalls": [
      "取模别只写在最后：中间结果会溢出（虽然这题 n 小，但习惯必须养对）。",
      "忘了 dp[0] = 1：会导致「合并两位」的转移永远缺一项，答案偏小。",
      "两位合法性要判 10~26 区间；只判 <= 26 在本题数据下够用，但完整写法应带上 >= 10。",
      "字符转数字要减 '0'，直接拿字符比较会得到 ASCII 码（例如 '1' 是 49）。",
      "求长度不能用 strlen 就随手写在循环条件里，那样会变成 O(n²)。"
    ],
    "walk": "样例 s = <code>111</code>：<br>dp[0] = 1<br>i=1（'1'）：dp[1] = dp[0] = 1 → 方案 {A}<br>i=2：单独 → dp[1] = 1；合并 11 ≤ 26 → +dp[0] = 1；dp[2] = 2 → {AA, K}<br>i=3：单独 → dp[2] = 2；合并 11 → +dp[1] = 1；dp[3] = 3 → {AAA, KA, AK}<br>输出 3，与样例一致。",
    "practice": [
      {
        "q": "如果密文里允许出现数字 0（如 10、20 这种），代码要怎么改？",
        "hint": "单独解码时 0 不合法（没有第 0 个字母），要判 s[i-1] != '0' 才能加上 dp[i-1]；合并时 10 和 20 合法。这是 LeetCode 91 题，是本题的加强版。"
      },
      {
        "q": "为什么不能直接输出 dp[n]，非要先取模？",
        "hint": "方案数是指数增长的（菲波那契级），n=2000 时有几百位，远超 long long。必须每步取模，否则溢出后答案完全错。"
      },
      {
        "q": "如果要求输出具体的所有解码方案，还能用这个 DP 吗？",
        "hint": "不能。DP 只统计「有多少种」，无法还原具体方案。要输出方案必须用 DFS 回溯枚举，复杂度是指数级。"
      }
    ]
  },
  "gridpath": {
    "strategy": "网格路径计数：从左上角走到右下角，每次只能向右或向下，问不同路径数。这是 DP 的入门模型：到达 (i,j) 只能来自上方 (i-1,j) 或左方 (i,j-1)，所以 <code>dp[i][j] = dp[i-1][j] + dp[i][j-1]</code>，边界要小心：第一行只能一直向右走、第一列只能一直向下走——但这只在<b>没有障碍</b>时成立；一旦路上有障碍，它后面的格子全都到不了。所以稳妥写法是统一转移，越界处当作 0（1-based 下标 + 显式判断 i==1 / j==1），障碍格直接 dp=0。结果可能很大，记得用 long long 或按给定模数取模。还有一个等价结论：无障碍时路径数就是组合数 C((n-1)+(m-1), n-1)（在总步数里选向下走的步数），可用阶乘/逆元 O(1) 算，但带障碍时必须 DP。",
    "knowledge": [
      "状态转移：dp[i][j] = dp[i-1][j] + dp[i][j-1]（只能右/下）。",
      "边界：第一行、第一列各只有 1 条路径。",
      "障碍处理：障碍格 dp 置 0。",
      "组合解释：无障碍 = C(行步数+列步数, 行步数)。",
      "大数用 long long 或取模，避免溢出。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nconst int MOD = 1000000007;\nint dp[505][505];\nint bad[505][505];\n\nint main(){\n    int n, m;\n    cin >> n >> m;\n\n    char c;\n    for (int i = 1; i <= n; i++)\n        for (int j = 1; j <= m; j++){\n            cin >> c;\n            bad[i][j] = (c == '#') ? 1 : 0;\n        }\n\n    dp[1][1] = 1;\n    for (int i = 1; i <= n; i++)\n        for (int j = 1; j <= m; j++){\n            if (i == 1 && j == 1) continue;\n            if (bad[i][j]) { dp[i][j] = 0; continue; }\n            int up = (i > 1) ? dp[i-1][j] : 0;\n            int lf = (j > 1) ? dp[i][j-1] : 0;\n            dp[i][j] = (up + lf) % MOD;\n        }\n    cout << dp[n][m] % MOD << \"\\n\";\n    return 0;\n}",
    "complexity": "O(n·m) 时间与空间。无障碍时退化为组合数 O(1) 计算。",
    "pitfalls": [
      "结果可能很大，用 long long（甚至取模），int 会溢出。",
      "边界处理：第一行/第一列只有一条路，dp=1。",
      "下标从 1 开始更直观，注意 n、m 与行列的对应关系。"
    ],
    "walk": "2×3 网格：dp[2][3]=3 条路径（实际 = C(3,1)=3）。",
    "practice": [
      {
        "q": "如果允许「向右、向下、向右下斜走」三种，转移怎么改？",
        "hint": "dp[i][j] = dp[i-1][j] + dp[i][j-1] + dp[i-1][j-1]。"
      },
      {
        "q": "网格很大（n,m 到 10^5）但障碍很少，怎么办？",
        "hint": "用组合数算无障碍总数，再逐障碍修正，或只在障碍附近 DP。"
      }
    ]
  },
  "cover": {
    "strategy": "区间覆盖题：给定若干线段，求最少用几条能把目标区间 [1, T] 完整覆盖。这是经典贪心：维护一个「当前已覆盖到 next-1」的指针，每一步在所有「左端点 ≤ next」的线段里，挑右端点最大的那条（能延伸最远），把 next 推进到它的右端点 +1，计数加一，重复直到覆盖 T。若某一步「能选的线段里最大右端点都到不了 next」，说明中间断开了，无解输出 -1。<br>两种实现等价：① 每轮全表扫描 O(n)，总复杂度 O(n·T)（本题 n ≤ 2000、T ≤ 200，最多约 4×10⁵ 次比较，足够）；② 先按左端点排序再用指针顺序扫描，总复杂度 O(n log n)（n 很大时才需要）。<br>注意别和「活动安排（选最多不相交区间）」混淆：覆盖关心「右端点最远」，活动安排关心「结束最早」，是两套不同的贪心。",
    "knowledge": [
      "贪心标准：左端点 ≤ 已覆盖位置的前提下，选右端点最大的区间。",
      "维护已覆盖边界 next，每步把 next 推到 far+1。",
      "无解判定：当前能选的区间右端点都 < next，直接 -1。",
      "与「活动安排（最多不相交）」区分：前者选右端点最大，后者选结束最早。",
      "排序不是必需的，只影响效率（O(n·T) → O(n log n)），贪心选择规则不变。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint L[2005], R[2005];\n\nint main(){\n    int n, T;\n    cin >> n >> T;\n    for (int i = 0; i < n; i++) cin >> L[i] >> R[i];\n\n    int used = 0, next = 1;\n    while (next <= T){\n        int far = next - 1;\n        for (int i = 0; i < n; i++)            // 在所有覆盖 next 的线段里挑右端点最远的\n            if (L[i] <= next && R[i] > far) far = R[i];\n        if (far < next) { cout << -1 << \"\\n\"; return 0; }   // 接不上了\n        next = far + 1;\n        used++;\n    }\n    cout << used << \"\\n\";\n    return 0;\n}",
    "complexity": "扫描式贪心 O(n·T)（本题约 4×10⁵ 次比较），排序优化版 O(n log n)；空间 O(n)。",
    "pitfalls": [
      "贪心标准是「左端点 ≤ next 中选右端点最大」，不是选最短或最早结束的。",
      "无解要判：当前能选的右端点都到不了 next，直接 -1。",
      "循环边界：next 用「已覆盖到 next-1」，选完推进到 far+1。"
    ],
    "walk": "区间 [1,3],[2,5],[6,8]，T=8：选 [1,3]→覆盖到 3，再选 [2,5]→覆盖到 5，再选 [6,8]→覆盖到 8，共 3 条。",
    "practice": [
      {
        "q": "如果是「选最多不相交区间」(活动安排)，贪心标准是什么？",
        "hint": "按结束时间(右端点)从小到大，能选就选，保证局部最优。"
      },
      {
        "q": "区间有重叠且输入未排序，不排序直接用上述代码会怎样？",
        "hint": "会漏选左端点靠后但右端点很大的区间，答案偏大或误判无解，必须先排序。"
      }
    ]
  },
  "brackets": {
    "strategy": "括号序列求「最长有效括号子串长度」。用栈：遇到 <code>(</code> 把下标入栈；遇到 <code>)</code> 若栈非空则弹出（匹配），当前有效长度 = 当前位置 - 栈顶下标（栈顶是「最后一个未匹配位置」）。栈空时把当前下标压入作为基准。本质是用栈记录「分隔点」：两个分隔点之间的距离就是一段有效括号长度。另一种思路是左右各扫一遍统计，互不依赖。注意这是子串（连续），和「能否完全匹配」不是一回事——完全匹配看栈是否清空，最长子串看分隔点间距。",
    "knowledge": [
      "栈里存「下标」不是字符，便于算长度。",
      "先压入 -1 作为左边界基准，避免栈空时越界。",
      "匹配后长度 = i - 栈顶；栈空则把 i 压入当新基准。",
      "题目是「最长有效括号子串（连续）」，不是括号是否匹配。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint st[100005];\n\nint main(){\n    int top = 0;\n    st[top++] = -1;          // 哨兵：栈底放\"最后一个未匹配位置\"\n    int i = 0, ans = 0;\n    char c;\n    while (cin >> c){\n        if (c == '(') st[top++] = i;\n        else {\n            top--;                       // 弹出匹配的左括号\n            if (top == 0) st[top++] = i; // 栈空说明这个右括号多余，作为新哨兵\n            else {\n                int len = i - st[top-1];\n                if (len > ans) ans = len;\n            }\n        }\n        i++;\n    }\n    cout << ans << \"\\n\";\n    return 0;\n}",
    "complexity": "O(n) 一次扫描，空间 O(n) 栈。",
    "pitfalls": [
      "栈里存的是「下标」不是字符，便于算长度。",
      "先压入 -1 作为左边界基准，避免栈空时越界。",
      "题目是「最长有效括号子串（连续）」，不是括号是否匹配。"
    ],
    "walk": "对 <code>(()</code>：匹配前缀长度 2；对 <code>)()())</code>：最长有效段 <code>()()</code> 长度 4。",
    "practice": [
      {
        "q": "如何同时输出这段最长有效子串本身（而不只是长度）？",
        "hint": "记录最大长度时的起止下标 (i - len, i)，用 substr 截出。"
      },
      {
        "q": "如果是三种括号 ()[]{} 的最长有效子串，怎么改？",
        "hint": "栈里同时存 (下标, 字符)，弹栈时检查类型匹配再算长度。"
      }
    ]
  },
  "maxsub": {
    "strategy": "最大子段和（连续子数组最大和），用 Kadane 算法：维护「以当前位置结尾的最大子段和」cur，与全局最大值 ans。cur = max(cur + a[i], a[i])，即「接上前面」或「从自己重新开始」取大；每步用 cur 更新 ans。O(n) 解决，注意全负时答案为最大那个负数。算法核心是「前缀和之差」：ans = max(前缀和[j] - 最小前缀和[i])，Kadane 只是把这个递推写成一维变量。变体很多：最大子矩阵和（枚举上下边界压缩成一维）、二维前缀和等，本质都是这题的扩展。",
    "knowledge": [
      "Kadane：cur = max(cur + a[i], a[i])，ans 取 cur 最大值。",
      "全是负数时答案应是最大的负数，初始化 ans 为一个很小的值而非 0。",
      "cur 重置规则是「cur>0 才接上」，等于 0 时从当前开始更优。",
      "本质是 前缀和[j] - 最小前缀和[i]，O(n) 递推。",
      "用 long long，数据可能很大。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint main(){\n    int n;\n    cin >> n;\n    long long ans = -1000000000LL;    // 不超过 2^53，保持 VM 执行\n    long long cur = 0;\n    for (int i = 0; i < n; i++){\n        long long x;\n        cin >> x;\n        if (cur > 0) cur = cur + x; else cur = x;   // 接着前面 or 从自己重新开始\n        if (cur > ans) ans = cur;\n    }\n    cout << ans << \"\\n\";\n    return 0;\n}",
    "complexity": "O(n) 时间，O(1) 空间。",
    "pitfalls": [
      "全是负数时答案应是最大的负数，初始化 ans 为一个很小的值而非 0。",
      "cur 重置规则是「cur>0 才接上」，等于 0 时从当前开始更优。",
      "用 long long，数据可能很大。"
    ],
    "walk": "序列 -2 1 -3 4 -1 2 1 -5 4：最大子段 [4,-1,2,1] 和为 6。",
    "practice": [
      {
        "q": "如果要求输出子段本身（起止位置）而不只是和，怎么改？",
        "hint": "记录 cur 重置时的起点，以及更新 ans 时的起止下标。"
      },
      {
        "q": "最大子矩阵和（二维）如何用本思想做？",
        "hint": "枚举上下边界，把每列和压成一维数组，对每一行调用 Kadane，取最大。"
      }
    ]
  },
  "tree": {
    "strategy": "树的直径 = 树上最远两点的距离。标准做法两次搜索（又称「两腿走」）：先从任意点（如 1 号）BFS/DFS 找到离它最远的点 u；再从 u 出发 BFS/DFS 找到离 u 最远的点 v，u 到 v 的距离就是直径。为什么对？因为树的直径一定经过「离某点最远的点」所在的最长链的一端；第一次搜索找到的端点 u 必是直径的一个端点。本质是无环图上的最远点对，用邻接表存边、边权累加距离即可；若带权把 d+1 换成 d+w。",
    "knowledge": [
      "两次 DFS/BFS：从任意点找最远点 u，再从 u 找最远点 v，dist(u,v) 即直径。",
      "DFS 必须记录父节点 fa 防止回边死循环。",
      "树的边无向，建图要双向加边。",
      "有边权时把 d+1 换成 d+w。",
      "也可用树形 DP：每个子树返回「向下最长链 + 次长链」更新直径。",
      "邻接表用数组模拟：head[u] 指向第一条边，to[] / nxt[] 串起所有边，避免嵌套 vector（本 IDE 不支持）。",
      "用 BFS 而不是递归 DFS：n 较大时递归会栈溢出，手写队列（数组 + 头尾指针）最稳。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint head[150005], to[300005], nxt[300005], ec = 0;\nint q[150005], dist[150005];\n\nvoid addEdge(int u, int v){\n    ec++;\n    to[ec] = v; nxt[ec] = head[u]; head[u] = ec;\n}\n\nint bfs(int s, int n){          // 返回离 s 最远的节点\n    for (int i = 1; i <= n; i++) dist[i] = -1;\n    int h = 0, t = 0;\n    q[t++] = s; dist[s] = 0;\n    int best = s;\n    while (h < t){\n        int u = q[h++];\n        if (dist[u] > dist[best]) best = u;\n        for (int e = head[u]; e; e = nxt[e]){\n            int v = to[e];\n            if (dist[v] == -1){ dist[v] = dist[u] + 1; q[t++] = v; }\n        }\n    }\n    return best;\n}\n\nint main(){\n    int n;\n    cin >> n;\n    for (int i = 1; i < n; i++){\n        int u, v;\n        cin >> u >> v;\n        addEdge(u, v); addEdge(v, u);\n    }\n    int u = bfs(1, n);      // 第一次：从任意点找最远点 u\n    bfs(u, n);              // 第二次：从 u 出发算最远距离\n    int ans = 0;\n    for (int i = 1; i <= n; i++) if (dist[i] > ans) ans = dist[i];\n    cout << ans << \"\\n\";\n    return 0;\n}",
    "complexity": "两次 BFS，各 O(n+m)（m = n-1），总复杂度 O(n)；空间 O(n)。",
    "pitfalls": [
      "DFS 必须记录父节点 fa 防止回边死循环。",
      "树的边无向，建图要双向加边。",
      "有边权时把 d+1 换成 d+w。"
    ],
    "walk": "链 1-2-3-4（3 条边）：直径 = 3。星型 1 连 2,3,4：直径 = 2。",
    "practice": [
      {
        "q": "如果图带正边权，上述两遍 DFS 还成立吗？",
        "hint": "成立。把 dfs 里的 d+1 改成 d+w，并改用带权距离比较即可。"
      },
      {
        "q": "如何用树形 DP 求直径（一遍 DFS）？",
        "hint": "每个点维护「向下最长链 d1 和次长链 d2」，直径候选 = d1+d2，向上返回 d1。"
      }
    ]
  },
  "digit": {
    "strategy": "数位统计：求 1 到 n 中数字 1 出现的次数。用「按位统计」：对每一位（个位、十位、百位…），把数字拆成高位 high、当前位 cur、低位 low，根据 cur 与 1 的关系分别累加 count = high*base + (cur>1?base:cur==1?low+1:0)。这是数位 DP 的入门题，避免暴力枚举（n 到 10^12 会超时）。理解关键是：固定某一位为 1，统计这一位上 1 出现的次数 = 高位部分循环次数 × base，再补上当前位恰好为 1 时低位部分的贡献。",
    "knowledge": [
      "按位统计：拆成 high / cur / low 三部分。",
      "分 cur<1、=1、>1 三种情况求和。",
      "cur==1 时加上 low+1；cur>1 时加上完整 base。",
      "n 很大（10^12）必须用 long long。",
      "统计的是数字 1 出现的总次数，不是含 1 的数的个数。"
    ],
    "code": "#include <iostream>\nusing namespace std;\nlong long count1(long long n){\n  long long ans = 0, base = 1;\n  while (n / base){\n    long long high = n / (base * 10), cur = (n / base) % 10, low = n % base;\n    if (cur < 1) ans += high * base;\n    else if (cur == 1) ans += high * base + low + 1;\n    else ans += (high + 1) * base;\n    base *= 10;\n  }\n  return ans;\n}\nint main(){ long long n; cin >> n; cout << count1(n) << \"\\n\"; return 0; }",
    "complexity": "O(log10 n) 按位统计，空间 O(1)。",
    "pitfalls": [
      "必须分 cur<1、=1、>1 三种情况，cur==1 时要加上 low+1。",
      "n 很大（10^12）必须用 long long。",
      "统计的是数字 1 出现的总次数，不是含 1 的数的个数。"
    ],
    "walk": "n=13：写出 12345678910111213，数字 1 共出现 6 次。",
    "practice": [
      {
        "q": "如何改成统计数字 0 出现的次数？",
        "hint": "特判最高位不能为 0：high 部分要减 1（当 high>0），其余类似；或单独处理前导零。"
      },
      {
        "q": "若要求 1 到 n 中「含数字 1 的数的个数」，思路有何不同？",
        "hint": "用补集：总数 - 每一位都∈{0,2..9} 的数的个数，可用数位 DP 计数。"
      }
    ]
  },
  "inverse": {
    "strategy": "逆序对：序列中 i<j 且 a[i]>a[j] 的对数。暴力 O(n²) 在 n=6000 时约 3.6×10⁷ 次比较，偏慢且可能超时。标准做法是在「归并排序」过程中顺带统计：合并左右两个已排好序的段时，若左段元素 a[i] > 右段当前元素 a[j]，则左段剩余 (mid-i+1) 个元素都与之构成逆序对，一次性累加。等价地也可用树状数组：把数值离散化后，从后往前扫描，每次查询「已插入的比当前小的数个数」累加，再插入当前数。逆序对数量最多 n(n-1)/2：本题 n ≤ 6000 时约 1.8×10⁷，int 够用；<b>若 n 更大（比如 10⁵）就必须用 long long</b>，这是最容易漏的一点。它和「冒泡排序的交换次数」相等，可用于判断数组是否接近有序。",
    "knowledge": [
      "归并排序计数：合并时左段 > 右段当前元素，ans += 左段剩余个数 (mid-i+1)。",
      "树状数组法：离散化后倒序查询已插入比当前小的个数。",
      "逆序对总数 = n(n-1)/2 量级，ans 必须 long long。",
      "逆序对数量 = 冒泡排序的最少交换次数。",
      "O(n²) 暴力在 n>5000 左右就会超时。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint a[10005], t[10005];\nint ans = 0;                 // n ≤ 8000 时逆序对最多约 3.2×10^7，int 足够\n\nvoid merge(int l, int r){\n    if (l >= r) return;\n    int m = (l + r) / 2;\n    merge(l, m);\n    merge(m + 1, r);\n    int i = l, j = m + 1, k = l;\n    while (i <= m && j <= r){\n        if (a[i] <= a[j]) t[k++] = a[i++];\n        else { t[k++] = a[j++]; ans += m - i + 1; }   // 左段剩余全部与之成逆序\n    }\n    while (i <= m) t[k++] = a[i++];\n    while (j <= r) t[k++] = a[j++];\n    for (int p = l; p <= r; p++) a[p] = t[p];\n}\n\nint main(){\n    int n;\n    cin >> n;\n    for (int i = 1; i <= n; i++) cin >> a[i];\n    merge(1, n);\n    cout << ans << \"\\n\";\n    return 0;\n}",
    "complexity": "归并排序 O(n log n)，空间 O(n) 辅助数组；ans 用 long long（最大 n(n-1)/2）。",
    "pitfalls": [
      "ans 累加的是 m - i + 1（左段剩余全部），不是 +1。",
      "逆序对总数可能超 int，ans 必须 long long。",
      "数组下标从 1 开始，递归边界 l>=r 返回。"
    ],
    "walk": "序列 3 1 2：3>1、3>2 构成 2 个逆序对，输出 2。",
    "practice": [
      {
        "q": "如何用树状数组在 O(n log n) 内求逆序对？",
        "hint": "离散化数值→从后往前，ans += query(a[i]-1)（已插入中比它小的），再 add(a[i],1)。"
      },
      {
        "q": "如果允许相同元素（a[i]==a[j] 不算逆序），归并里判断要怎么写？",
        "hint": "用 a[i] <= a[j] 时取左段（<= 不计数），保证相等不算逆序。"
      }
    ]
  },
  "lis": {
    "strategy": "最长上升子序列（LIS）。O(n²) DP（dp[i]=以 i 结尾的最长长度）在 n=10⁴ 时约 10⁸ 次，会超时，需用 O(n log n) 的「贪心 + 二分」：维护一个 tails 数组，tails[k] 表示「长度为 k 的上升子序列的最小可能结尾」。遍历每个数 x，用二分找到它在 tails 中「第一个 ≥ x 的位置 p」（即 lower_bound），把 tails[p] 替换成 x；若 x 比所有 tails 都大则追加到末尾。tails 的当前长度就是 LIS 长度。注意：tails 数组存的不是真正的 LIS 序列，只是各长度的最优结尾；若要求输出序列需另开数组记录前驱。严格上升用 ≥，若「非降（允许相等）」则把判断改成 >。",
    "knowledge": [
      "O(n log n)：维护 tails[k] = 长度为 k 的 LIS 的最小结尾。",
      "二分找「第一个 ≥ x 的位置」（lower_bound）并替换；更大则追加。",
      "tails 长度即 LIS 长度，但 tails 本身不是 LIS 序列。",
      "严格上升用 ≥；非降用 >（找第一个 > x）。",
      "要输出序列需额外记录前驱 / 用二分定位。"
    ],
    "code": "#include <iostream>\nusing namespace std;\nint a[100005], tails[100005];\nint lower(int len, int x){\n  int lo = 1, hi = len, res = len + 1;\n  while (lo <= hi){ int mid = (lo + hi) / 2; if (tails[mid] >= x){ res = mid; hi = mid - 1; } else lo = mid + 1; }\n  return res;\n}\nint main(){\n  int n; cin >> n; for (int i=1;i<=n;i++) cin >> a[i];\n  int len = 0;\n  for (int i=1;i<=n;i++){ int p = lower(len, a[i]); tails[p] = a[i]; if (p > len) len = p; }\n  cout << len << \"\\n\";\n  return 0;\n}",
    "complexity": "每个元素一次二分 O(log n)，总 O(n log n)，空间 O(n)。",
    "pitfalls": [
      "二分找的是「第一个 ≥ x 的位置」（lower_bound），不是 > x。",
      "tails 数组存的是各长度的最小结尾，不是真正的 LIS 序列。",
      "严格上升用 ≥；若「非降」则把判断改成 >。"
    ],
    "walk": "序列 2 1 5 3 6 4 8 9：LIS = 1,3,4,8,9 长度 5。",
    "practice": [
      {
        "q": "如何在 O(n log n) 内输出一条具体的 LIS 序列？",
        "hint": "用 tailPos[i] 记录 a[i] 在 tails 中的位置，并维护每个长度的「上一项下标」，从末尾最长处回溯。"
      },
      {
        "q": "如果是「最长不下降子序列」，二分判断怎么改？",
        "hint": "把 tails[mid] >= x 改成 tails[mid] > x（即找第一个 > x 的位置）。"
      }
    ]
  },
  "pack": {
    "strategy": "01 背包：n 件物品，第 i 件占 w_i 容量、价值 v_i，背包容量 W，求最大总价值。设 dp[j] = 容量为 j 时的最大价值，对每件物品倒序枚举容量：dp[j] = max(dp[j], dp[j-w] + v)。「倒序」是关键——保证同一件物品在本次更新中只被考虑一次（若正序则变成完全背包，同一物品可取多次）。初始化 dp[0]=0、其余（求最大价值且可不选）为 0 即可。本题容量 W ≤ 2000、n ≤ 100，一维滚动数组 O(nW) 约 2×10⁵ 次更新，完全够用。变体：要求装满（恰好 V）时初始化 dp[0]=0、其余 -inf；求方案数时把 max 改成累加。",
    "knowledge": [
      "状态 dp[j] = 容量 j 时的最大价值；转移 dp[j] = max(dp[j], dp[j-v]+w)。",
      "容量必须倒序枚举，正序会变成完全背包。",
      "dp[0]=0，其余默认 0（可不选）。",
      "价值累加可能超 int，用 long long。",
      "变体：恰好装满 → 其余初始化 -inf；求方案数 → 累加。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nint dp[20005];\n\nint main(){\n    int n, W;\n    cin >> n >> W;\n    for (int i = 0; i < n; i++){\n        int w, v;\n        cin >> w >> v;\n        for (int j = W; j >= w; j--)          // 倒序：保证每件物品只用一次\n            if (dp[j-w] + v > dp[j]) dp[j] = dp[j-w] + v;\n    }\n    cout << dp[W] << \"\\n\";\n    return 0;\n}",
    "complexity": "O(n·V) 时间，O(V) 一维空间（滚动数组优化）。",
    "pitfalls": [
      "容量必须倒序枚举，正序会变成完全背包（同一物品取多次）。",
      "dp 数组要初始化为 0（求最大价值且每件可不选）。",
      "价值累加可能超 int，用 long long。"
    ],
    "walk": "容量 4：物品(2,3)、(3,4)、(1,2)。最优取 (2,3)+(1,2)=5 或 (3,4)=4，答案 5。",
    "practice": [
      {
        "q": "若要求「恰好装满」容量 V，初始化要怎么改？",
        "hint": "dp[0]=0，其余初始化为 -inf（一个很小的数），只有真正可达的状态才被更新。"
      },
      {
        "q": "如果还要输出「选了哪些物品」，怎么办？",
        "hint": "用二维 dp 或记录每个 dp[j] 是否由 dp[j-v]+w 转移而来，倒序回溯选物品。"
      }
    ]
  },
  "dijkstra": {
    "strategy": "单源最短路（边权非负），Dijkstra。用 dist[] 记录起点到各点的最短距离；每轮从「尚未确定（未 vis）」的点里挑 dist 最小的，标记为确定，用它所有的出边去松弛邻居（若 dist[u]+w < dist[v] 则更新）。朴素写法 O(n²)：直接线性扫找最小 dist，本题 n ≤ 500、m ≤ 1500，O(n²) 完全够用。若 n 更大，标准优化是用优先队列（小根堆）把选点降到 O(log n)，总复杂度 O((n+m)log n)——但本模拟器的 IDE 不支持 priority_queue，所以这里就用 O(n²) 写法。注意：边权必须非负（负权要用 SPFA / Bellman-Ford）；重边取最小权；不可达输出 -1 而非 INF。",
    "knowledge": [
      "Dijkstra 核心：每轮选未确定的 dist 最小点，用它松弛出边。",
      "边权必须非负；负权改用 SPFA / Bellman-Ford。",
      "朴素 O(n²) 适合本题 n ≤ 500；优先队列版 O((n+m)log n) 适合稀疏图。",
      "重边取最小权，自环忽略；距离初值 INF。",
      "不可达输出 -1 而不是 INF。"
    ],
    "code": "#include <iostream>\nusing namespace std;\n\nconst int INF = 1000000000;\nint head[1005], to[10005], wt[10005], nxt[10005], ec = 0;\nint dist[1005], vis[1005];\n\nvoid addEdge(int u, int v, int w){\n    ec++;\n    to[ec] = v; wt[ec] = w; nxt[ec] = head[u]; head[u] = ec;\n}\n\nint main(){\n    int n, m;\n    cin >> n >> m;\n    for (int i = 0; i < m; i++){\n        int u, v, w;\n        cin >> u >> v >> w;\n        addEdge(u, v, w);\n        addEdge(v, u, w);      // 无向图，双向建边\n    }\n\n    for (int i = 1; i <= n; i++) dist[i] = INF;\n    dist[1] = 0;\n\n    for (int t = 1; t <= n; t++){\n        int u = 0;\n        for (int i = 1; i <= n; i++)          // 找未确定点里 dist 最小的\n            if (!vis[i] && (u == 0 || dist[i] < dist[u])) u = i;\n        if (u == 0 || dist[u] == INF) break;\n        vis[u] = 1;\n        for (int e = head[u]; e; e = nxt[e]){ // 松弛邻居\n            int v = to[e];\n            if (dist[u] + wt[e] < dist[v]) dist[v] = dist[u] + wt[e];\n        }\n    }\n\n    if (dist[n] == INF) cout << -1 << \"\\n\";\n    else cout << dist[n] << \"\\n\";\n    return 0;\n}",
    "complexity": "朴素 O(n²) 选点 + O(n) 松弛，总 O(n²)；优先队列版 O((n+m)log n)。",
    "pitfalls": [
      "边权必须非负，负权要用 SPFA/Bellman-Ford。",
      "重边要取最小权，自环忽略；距离初值设 INF。",
      "不可达输出 -1 而不是 INF。"
    ],
    "walk": "3 点：1→2 权 2，1→3 权 5，2→3 权 1。起点 1 到 3 最短路 = 2+1=3，而非直连 5。",
    "practice": [
      {
        "q": "如何用优先队列（堆）把复杂度降到 O((n+m)log n)？",
        "hint": "用 priority_queue<pair<dist,int>> 存 (距离,点)，每次取堆顶最小；松弛时 push 新状态。"
      },
      {
        "q": "如果图里有重边且带自环，代码如何保证正确？",
        "hint": "建邻接表时若取最小权可先判重；自环 i==j 在松弛时 dist[u]+w<dist[u] 不会成立，天然忽略。"
      }
    ]
  }
};
