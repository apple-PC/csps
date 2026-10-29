/* 复习端 · 算法教学（CSP-J/S 全考纲算法）
 * 依赖 review-data.js 里已存在的 REVIEW_SECTIONS.algo（语法十一章），在其后追加算法章节。
 * 所有模板均为可直接提交的 C++14/17 代码；String.raw 保证代码里的 \n \0 原样保留。
 */
(function () {
  'use strict';
  var raw = String.raw;
  var A = (window.REVIEW_SECTIONS || {}).algo;
  if (!A || !A.nodes) return;

  A.intro = '这一板块按 CSP-J/S 考纲把算法完整过一遍：从枚举、排序、二分这些入门工具，到前缀和、并查集、树状数组、线段树、图论、动态规划、搜索、数论与字符串，最后是考场上的模型转化与卡常对拍。左边按「基础思想 → 线性结构 → 树与区间 → 图论 → DP → 搜索 → 数学与字符串 → 综合实战」分组，每章都有原理、要点清单和可直接套用的模板代码。语法还不熟的话，先看「第零部分 · 语法基础」十一章。';

  /* 语法十一章归入第零部分 */
  A.nodes.forEach(function (n){ n.group = '📘 第零部分 · 语法基础'; });

  var nodes = A.nodes;

  /* ══════════════════════════════════════════════════════
   * 第一部分 · 程序设计与基础思想
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a01', group: '📐 第一部分 · 基础思想与常用工具',
      title: '第十二章 · 枚举、模拟与暴力优化', meta: '入门 · J/S 必考',
      blocks: [
        { h: '枚举是最后一道防线', html: raw`<p>CSP-S 的每道题，第一件事都应该是「<b>我能不能用暴力拿部分分</b>」。暴力不是丢人的做法，是保底策略：一道题 100 分里有 40 分给 O(n²)，你写出 40 分再去想正解，比死磕正解结果爆零要划算得多。枚举的核心是<b>枚举什么</b>——枚举答案、枚举状态、还是枚举操作序列。</p>` },
        { h: '三种枚举对象', list: [
          '枚举答案：答案范围小就直接从小往大试（如「最少几步」逐步加一）',
          '枚举状态：n ≤ 20 时枚举 2ⁿ 个集合，n ≤ 9 时枚举 n! 个排列',
          '枚举操作/决策：每一步有 k 种选择，k^m 种可能，配 DFS 回溯',
          '枚举子集：for (int s = mask; s; s = (s - 1) & mask) 遍历全部子集，总复杂度 3ⁿ'
        ] },
        { h: '子集枚举与二进制状压遍历', code: raw`// 枚举 0 ~ 2^n-1 的全部子集
for (int mask = 0; mask < (1 << n); mask++) {
    long long sum = 0;
    for (int i = 0; i < n; i++)
        if (mask >> i & 1) sum += a[i];
    // 用 sum 做判断
}

// 枚举 mask 的所有子集（3^n 总量）
for (int sub = mask; sub; sub = (sub - 1) & mask) { /* ... */ }` },
        { h: '暴力怎么优化成能拿分的版本', list: [
          '减少重复计算：把内层循环能预处理的东西提到外面（前缀和、预处理表）',
          '换枚举顺序：从「枚举起点+终点」换成「枚举中间点+左右扩展」',
          '加剪枝：当前答案已经不可能更优时直接 return（见搜索一章）',
          '降低枚举维度：n³ 里有一维可以用二分/哈希 O(log n) 查掉，变成 n² log n',
          'bitset 加速：把「是否存在」的布尔数组压成位，一次算 64 个，常数直接除 64'
        ] },
        { h: '模拟题的纪律', html: raw`<p>模拟题（% 取模、日期、贪吃蛇、表达式求值一类）没有算法难度，扣分全在细节：<b>先写清题意再动手</b>，把每个变量代表什么写在注释里；边界值（0、1、最大值、负数）单独想一遍；取模题每一步都 <code>% mod</code> 并且注意出现减法时 <code>(x - y + mod) % mod</code>。模拟题写完一定要自己造 3 组小数据手算对拍。</p>` }
      ]
    },
    {
      id: 'a02', group: '📐 第一部分 · 基础思想与常用工具',
      title: '第十三章 · 递推与递归', meta: '入门 · 一切 DP 的起点',
      blocks: [
        { h: '递推 vs 递归', html: raw`<p><b>递推</b>是「从已知的小规模，一步步推到大规模」，写成循环；<b>递归</b>是「把大问题化成同构的小问题」，写成函数自己调自己。二者数学上等价，区别在实现：递推没有函数调用开销、不会爆栈；递归写起来更贴合思维，适合结构本身是递归的（树、分治）。</p>` },
        { h: '写递归的三个必备要素', list: [
          '边界（递归出口）：n = 0 / 1 或叶子节点时直接返回，没有出口必定爆栈',
          '递归式：f(n) 用 f(n-1)、f(n/2) 等更小规模的答案表示',
          '返回值语义：明确函数「返回什么」，不要一会儿返回方案数一会儿返回最大值'
        ] },
        { h: '记忆化搜索：递归 + 缓存', html: raw`<p>纯递归会重复计算（斐波那契 O(2ⁿ)）。加一个 <code>memo</code> 数组，算过就直接返回，复杂度立刻降到「状态数 × 单状态转移代价」。<b>记忆化搜索就是 DP</b>，只是用递归实现——想不到递推顺序时，先写记忆化搜索，再改写成循环，这是最稳的 DP 入门路径。</p>`, },
        { h: '记忆化模板', code: raw`int memo[N];              // -1 表示未计算
int solve(int n) {
    if (n <= 1) return 1;                 // 边界
    int &res = memo[n];
    if (res != -1) return res;            // 已经算过
    return res = solve(n - 1) + solve(n - 2);
}
// 调用前：memset(memo, -1, sizeof memo);` },
        { h: '栈深度与栈空间', html: raw`<p>C++ 递归深度一般到 <b>10⁵</b> 就有风险（每层几十字节栈帧，默认栈 8MB）。链状结构的树、图 DFS 很容易踩到。两条路：① 手写栈把递归改成迭代；② 局部加 <code>#pragma comment(linker, "/STACK:...")</code> 只在 Windows 有效，Linux 评测机不认，别指望它。真正保险的做法仍是控制递归深度。</p>` }
      ]
    },
    {
      id: 'a03', group: '📐 第一部分 · 基础思想与常用工具',
      title: '第十四章 · 排序与逆序对', meta: '入门 · O(n log n)',
      blocks: [
        { h: '先会用 sort', html: raw`<p>考试 99% 的场景直接 <code>sort(a, a + n)</code>。需要自定义顺序时写比较函数：返回 <code>true</code> 表示「a 应该排在 b 前面」。<b>铁律</b>：比较函数必须是严格弱序（不能出现 <code>a &lt;= b</code> 这种），否则 sort 会越界崩溃——这是最常见的 RE 原因之一。</p>` },
        { h: '结构体排序与多关键字', code: raw`struct Node { int x, y, id; };
bool cmp(const Node &a, const Node &b) {
    if (a.x != b.x) return a.x < b.x;   // 第一关键字升序
    if (a.y != b.y) return a.y > b.y;   // 第二关键字降序
    return a.id < b.id;                 // 保证严格弱序，绝不写 <=
}
sort(v.begin(), v.end(), cmp);

// 去重：先排序，再 unique
sort(a, a + n);
n = unique(a, a + n) - a;` },
        { h: '归并排序求逆序对', html: raw`<p>「逆序对」= 满足 i &lt; j 且 a[i] &gt; a[j] 的对数。归并排序合并两个有序段时，右段某个元素被取出，说明左段剩下的元素全都比它大，一次性贡献 <code>mid - i + 1</code> 个逆序对。总复杂度 O(n log n)，比「树状数组 + 离散化」短很多，考场上优先写这个。</p>` },
        { h: '归并求逆序对模板', code: raw`long long ans = 0;
int a[N], tmp[N];
void msort(int l, int r) {
    if (l >= r) return;
    int mid = (l + r) >> 1;
    msort(l, mid); msort(mid + 1, r);
    int i = l, j = mid + 1, k = l;
    while (i <= mid && j <= r) {
        if (a[i] <= a[j]) tmp[k++] = a[i++];
        else { ans += mid - i + 1; tmp[k++] = a[j++]; }  // 左段剩余全部更大
    }
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= r)   tmp[k++] = a[j++];
    for (int t = l; t <= r; t++) a[t] = tmp[t];
}` },
        { h: '什么时候不用 sort', list: [
          '值域很小（≤ 10⁶）：计数排序 O(n + V)，稳定且常数极小',
          '求前 k 大：nth_element 平均 O(n)，或维护大小为 k 的小根堆 O(n log k)',
          '要「边读边排序」且要求稳定：结构体里带原始下标，比较时同值比下标',
          '排序会影响答案时（如相邻交换类贪心）：先想清楚排序依据再排'
        ] }
      ]
    },
    {
      id: 'a04', group: '📐 第一部分 · 基础思想与常用工具',
      title: '第十五章 · 二分：查找、答案与三分', meta: 'J/S 高频 · 最容易写错',
      blocks: [
        { h: '二分的本质', html: raw`<p>二分的本质不是「有序数组里找数」，而是<b>在一个具有单调性的判定上找边界</b>：把区间分成「一定不满足」和「一定满足」两半，每次丢掉一半。所以只要 check(x) 随 x 单调，就能二分 x。</p>` },
        { h: '整数二分（两套模板，别混用）', code: raw`// ① 找最后一个「满足 check 的位置」（下界型：最小化答案）
int lo = L, hi = R, ans = -1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (check(mid)) { ans = mid; hi = mid - 1; }  // 可行，试着更小
    else lo = mid + 1;
}

// ② 找最后一个「不满足的位置」（最大化答案）
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (check(mid)) { ans = mid; lo = mid + 1; }  // 可行，试着更大
    else hi = mid - 1;
}` },
        { h: '二分答案的三步套路', list: [
          '① 确认答案是单调的：答案越大/越小，越容易（或越难）满足条件',
          '② 写 check(x)：在「答案限定为 x」时判断是否可行，通常是 O(n) 或 O(n log n) 的贪心/DP/图论',
          '③ 二分这个答案：注意上下界（下界取不可能值，上界取必然可行值），总复杂度 O(check × log V)',
          '典型题：最小化最大值（划分数组、砍树、跳石头）、最大化最小值（安排间距、装水）'
        ] },
        { h: '实数二分与三分', code: raw`// 实数二分：固定迭代次数比 while(r-l>eps) 更稳，不会有死循环
for (int it = 0; it < 100; it++) {
    double mid = (l + r) / 2;
    if (check(mid)) r = mid; else l = mid;
}

// 三分求单峰函数极值（严格凸/凹）
while (r - l > 1e-6) {
    double m1 = l + (r - l) / 3, m2 = r - (r - l) / 3;
    if (f(m1) < f(m2)) l = m1; else r = m2;   // 求最小值
}` },
        { h: '二分写错的原因清单', list: [
          '用 (l + r) / 2 在 l、r 都接近 2³¹ 时溢出 → 写 lo + (hi - lo) / 2',
          'check 里用了全局变量却没重置 → 每次 check 前 memset / 重新初始化',
          '上下界设错，答案不在区间里 → 用「不可能值」当 lo，「必然可行值」当 hi',
          '把第一套和第二套模板混着写 → 死循环。背一套，另一套现推'
        ] }
      ]
    },
    {
      id: 'a05', group: '📐 第一部分 · 基础思想与常用工具',
      title: '第十六章 · 贪心与正确性证明', meta: 'J/S 高频 · 靠证明拿分',
      blocks: [
        { h: '贪心的两个前提', html: raw`<p>贪心每一步都取当前看起来最好的选择，且<b>不回头</b>。能用贪心必须同时满足：<b>贪心选择性质</b>（存在最优解包含当前贪心选择）和<b>最优子结构</b>（做出该选择后，剩下的子问题仍可贪心求解）。考场上光「感觉对」是不够的——想出贪心后必须能说清楚为什么对，否则很可能是错的（反例往往在小数据里）。</p>` },
        { h: '三种常用证明方法', list: [
          '交换论证：假设最优解与贪心解第一个不同的位置，交换两者后不更差 → 贪心不劣',
          '邻项交换：若相邻两个元素的顺序按某关键字排列最优，则该关键字就是排序依据（排队接水、国王游戏）',
          '反证/归纳：假设存在更优解，推出与贪心策略矛盾'
        ] },
        { h: '经典模型一：区间调度', code: raw`// 最多能参加多少个不重叠区间：按右端点升序，能选就选
struct Seg { int l, r; };
sort(v.begin(), v.end(), [](const Seg &a, const Seg &b){ return a.r < b.r; });
int cnt = 0, last = -1e9;
for (auto &s : v) if (s.l >= last) { cnt++; last = s.r; }
// 若要求「覆盖 [1,m] 最少用几个区间」：按左端点排序，每次在能接上的区间里取右端点最远的` },
        { h: '经典模型二：反悔贪心（堆辅助）', html: raw`<p>有些贪心「现在选错了要能退货」。做法是用堆保存已选元素，遇到更好的选择就弹出最差的那个。典型题：<b>工作安排</b>（截止时间 + 收益，求最大收益）——按截止时间排序，用小根堆存已选收益，超时了就把收益最小的踢掉；<b>合并果子 / Huffman</b>——每次取最小的两个合并。</p>` },
        { h: '贪心与 DP 的分界', html: raw`<p>贪心只保留一个状态（当前最优），DP 保留所有可能状态。当你发现「当前最优不一定是全局最优，需要同时保留多个候选」时，就该换 DP 或加堆做反悔。判断口诀：<b>决策之间是否互相影响</b>——不影响就贪心，影响就 DP。</p>` }
      ]
    },
    {
      id: 'a06', group: '📐 第一部分 · 基础思想与常用工具',
      title: '第十七章 · 双指针与滑动窗口', meta: 'J/S 高频 · O(n) 替代 O(n²)',
      blocks: [
        { h: '双指针的两种形态', html: raw`<p><b>同向双指针（滑动窗口）</b>：右指针扩张、左指针收缩，维护一个满足条件的区间，用于「最长/最短的连续子段满足某性质」。<b>相向双指针</b>：左右往中间收，用于有序数组的两数之和、去重、回文判断。<b>快慢指针</b>：链表判环、找中点。</p>` },
        { h: '滑动窗口的成立条件', list: [
          '区间扩张时性质单调变化（越扩越容易/越难满足），才能通过移动左端点恢复',
          '典型可做：和 ≤ K 的最长子段、不含重复字符的最长子串、恰好包含 k 种的最短区间',
          '不满足单调性的（如「子段和恰好等于 K 且有负数」）不能用滑动窗口，改用前缀和 + 哈希'
        ] },
        { h: '滑动窗口模板（和不超过 K 的最长子段）', code: raw`int l = 0; long long sum = 0; int best = 0;
for (int r = 0; r < n; r++) {
    sum += a[r];                    // 右端点扩张
    while (sum > K) sum -= a[l++];  // 不满足就收缩左端点
    best = max(best, r - l + 1);    // 现在 [l, r] 一定合法
}
// 每个元素最多进出各一次 → O(n)` },
        { h: '相向双指针：有序数组两数之和', code: raw`int i = 0, j = n - 1;
while (i < j) {
    int s = a[i] + a[j];
    if (s == target) { /* 找到 */ break; }
    if (s < target) i++;      // 太小，左端右移增大
    else j--;                 // 太大，右端左移减小
}` },
        { h: '多指针与「三数之和」', html: raw`<p>三数之和 = 枚举第一个数 + 后两个用相向双指针，O(n²)。四数之和同理 O(n³)。关键点：<b>排序后跳过重复值</b>（<code>if (i &amp;&amp; a[i] == a[i-1]) continue;</code>），否则会输出重复答案。</p>` }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第二部分 · 线性数据结构与常用技巧
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a07', group: '🧮 第二部分 · 线性结构与常用技巧',
      title: '第十八章 · 前缀和与差分', meta: '入门必备 · O(1) 区间操作',
      blocks: [
        { h: '一维前缀和', html: raw`<p>把「区间求和」从 O(n) 降到 O(1)：<code>sum[i] = a[1] + … + a[i]</code>，则区间 [l, r] 的和是 <code>sum[r] - sum[l-1]</code>。<b>下标从 1 开始</b>能省掉所有 if 判断，竞赛代码默认这么写。</p>` },
        { h: '一维 / 二维前缀和', code: raw`// 一维：构造 O(n)，查询 O(1)
pre[i] = pre[i - 1] + a[i];
inline long long qsum(int l, int r) { return pre[r] - pre[l - 1]; }

// 二维：s[i][j] = 左上角 (1,1) 到 (i,j) 的矩形和
s[i][j] = s[i-1][j] + s[i][j-1] - s[i-1][j-1] + a[i][j];
// 子矩形 (x1,y1)-(x2,y2)：
long long q = s[x2][y2] - s[x1-1][y2] - s[x2][y1-1] + s[x1-1][y1-1];` },
        { h: '差分：区间修改变两点修改', html: raw`<p>要在 [l, r] 上统一加 v，做了 m 次后再整体查询——用差分数组 <code>d[i] = a[i] - a[i-1]</code>，区间加变成 <code>d[l] += v, d[r+1] -= v</code>，O(1) 一次；最后对 d 求前缀和还原 a。这是「离线区间修改」的标准做法，也是树状数组/线段树的前置思想。</p>` },
        { h: '差分模板', code: raw`// 区间 [l, r] 全部加 v
d[l] += v; d[r + 1] -= v;
// 全部操作结束后还原（得到最终数组）
for (int i = 1; i <= n; i++) { d[i] += d[i - 1]; a[i] = d[i]; }` },
        { h: '进阶用法', list: [
          '二维差分：矩形加 → 四个角修改，最后二维前缀和还原',
          '前缀和 + 哈希：统计「和恰好为 K」的子段个数（把 pre[j] - pre[i] = K 转成查 pre[i]）',
          '前缀最大值/最小值：用于判断「右侧是否存在更大/更小的数」',
          '前缀异或：区间异或和，同样可减（异或的逆运算就是异或）'
        ] }
      ]
    },
    {
      id: 'a08', group: '🧮 第二部分 · 线性结构与常用技巧',
      title: '第十九章 · 栈、队列与单调结构', meta: 'J/S 高频 · 单调栈/单调队列',
      blocks: [
        { h: '栈与队列的基本用途', html: raw`<p>栈（后进先出）：括号匹配、表达式求值、进制转换、撤销操作、DFS 的迭代写法。队列（先进先出）：BFS 层序遍历、滑动窗口、任务调度。C++ 里直接用 <code>stack&lt;int&gt;</code> / <code>queue&lt;int&gt;</code> / <code>deque&lt;int&gt;</code>，手写只在需要按下标访问时（<code>int st[N], top = 0;</code>）。</p>` },
        { h: '单调栈：找「左边/右边第一个更大（更小）的元素」', html: raw`<p>维护一个<b>单调递减</b>的栈，遍历到 a[i] 时把栈顶所有 ≤ a[i] 的弹掉——每个被弹出的元素，a[i] 就是它右边第一个比它大的数，弹出后的栈顶就是它左边第一个比它大的数。<b>每个元素进出栈各一次，O(n)</b>。典型应用：柱状图最大矩形、接雨水、最大子矩阵、去掉 k 位数字使剩余最小。</p>` },
        { h: '单调栈模板', code: raw`int st[N], top = 0;          // 存下标，栈内对应值单调递减
for (int i = 1; i <= n; i++) {
    while (top && a[st[top]] <= a[i]) {
        int j = st[top--];       // j 的右边界就是 i，左边界是新的栈顶
        // 以 a[j] 为最小值的区间宽度 = i - st[top] - 1
    }
    st[++top] = i;
}` },
        { h: '单调队列：滑动窗口最值', html: raw`<p>求长度为 k 的窗口内的最大值：维护一个<b>下标递增、值递减</b>的双端队列。新元素入队前弹掉所有比它小的（它们永远不可能再成为最大值），同时把队头滑出窗口的下标扔掉。队头始终是当前窗口最大值，O(n)。</p>` },
        { h: '单调队列模板', code: raw`deque<int> q;                 // 存下标，值单调递减
for (int i = 1; i <= n; i++) {
    while (!q.empty() && a[q.back()] <= a[i]) q.pop_back();  // 弹掉更小的
    q.push_back(i);
    while (q.front() <= i - k) q.pop_front();                // 滑出窗口
    if (i >= k) mx[i] = a[q.front()];                        // 窗口 [i-k+1, i] 的最大值
}` },
        { h: '单调队列优化 DP 的信号', html: raw`<p>看到转移式形如 <code>f[i] = max(f[j] + w(i)) ，j ∈ [i-k, i-1]</code>，窗口固定并且只要最值 —— 这就是单调队列优化的标志（经典题：跳跃不超过 k 步的最大得分、多重背包、划分型 DP）。</p>` }
      ]
    },
    {
      id: 'a09', group: '🧮 第二部分 · 线性结构与常用技巧',
      title: '第二十章 · 堆与优先队列', meta: 'J/S 高频 · 动态最值',
      blocks: [
        { h: 'priority_queue 速查', html: raw`<p>C++ 的 <code>priority_queue</code> 默认是<b>大根堆</b>（top 是最大值）。要小根堆写 <code>priority_queue&lt;int, vector&lt;int&gt;, greater&lt;int&gt;&gt;</code>，或者干脆存 <code>-x</code>。操作：push / pop / top 均为 O(log n)，top 是 O(1)。</p>` },
        { h: '堆能解决的问题', list: [
          '动态维护最值：一边插入一边问当前最大/最小',
          '多路归并：k 个有序表合并（每次取 k 个队头的最小值）',
          '反悔贪心：把已选元素丢进堆，遇到更好的就把最差的换掉',
          'Huffman / 合并果子：每次取最小两个合并再放回',
          'Dijkstra 的优先队列优化：每次取距离最小的未确定点',
          '对顶堆：一个大根堆 + 一个小根堆，动态维护中位数'
        ] },
        { h: '对顶堆求中位数', code: raw`priority_queue<int> big;                                  // 存较小的一半，堆顶是其中最大
priority_queue<int, vector<int>, greater<int>> small;     // 存较大的一半，堆顶是其中最小
void add(int x) {
    if (big.empty() || x <= big.top()) big.push(x); else small.push(x);
    if (big.size() > small.size() + 1) { small.push(big.top()); big.pop(); }
    if (small.size() > big.size())     { big.push(small.top()); small.pop(); }
}
double mid() {
    if (big.size() == small.size()) return (big.top() + small.top()) / 2.0;
    return big.top();
}` },
        { h: '手写堆（少用，但要知道）', html: raw`<p>需要「删除任意元素」或「修改某元素」时（如可并堆、Dijkstra 的 decrease-key），STL 的 priority_queue 做不到，得手写或用 <code>set</code> 代替。手写堆两个操作：上浮 <code>while (i &gt; 1 &amp;&amp; a[i] &lt; a[i/2]) swap(i, i/2)</code>、下沉 <code>while (2i &lt;= n)</code> 与较小儿子交换。</p>` },
        { h: '可并堆（左偏树）一句话', html: raw`<p>需要「合并两个堆」时（如树上合并子树信息），普通堆要 O(n log n) 全部塞进去，左偏树可以 O(log n) 合并。CSP-S 出现频率不高，知道有这个东西、会用 pb_ds 就够：<code>__gnu_pbds::priority_queue</code> 支持 <code>join()</code>。</p>` }
      ]
    },
    {
      id: 'a10', group: '🧮 第二部分 · 线性结构与常用技巧',
      title: '第二十一章 · 哈希表与离散化', meta: 'J/S 高频 · 值域压缩',
      blocks: [
        { h: 'unordered_map 能不能用', html: raw`<p>能用，但有坑：① 常数比 map 大得多，10⁶ 级数据会 TLE；② <b>会被卡</b>——出题人构造让所有 key 落到同一桶的数据，复杂度退化成 O(n)。防卡的办法是自定义哈希函数（加随机扰动），或者用 <code>map</code>（O(log n)，稳定），或者手写哈希表。</p>` },
        { h: '离散化：把大值域压成小下标', html: raw`<p>值域到 10⁹ 但只有 10⁵ 个数时，很多算法（树状数组、线段树、计数）要按下标存。做法：排序去重得到排名，把每个数替换成它的排名。<b>注意</b>：只关心相对大小时才能离散化；如果要用原值算差值，离散化后要保留原值数组。</p>` },
        { h: '离散化模板', code: raw`vector<int> v(a + 1, a + n + 1);
sort(v.begin(), v.end());
v.erase(unique(v.begin(), v.end()), v.end());
for (int i = 1; i <= n; i++)
    b[i] = lower_bound(v.begin(), v.end(), a[i]) - v.begin() + 1;  // 1 ~ m 的排名
// 若需要「原值 → 排名」多次查询，用 unordered_map 预处理或直接二分` },
        { h: '手写哈希表（防卡 + 高性能）', code: raw`const int M = 1 << 20;              // 2 的幂，取模用 & (M-1)
int head[M], nxt[N], key[N], val[N], tot = 0;
inline int &get(int k) {
    int h = (unsigned)(k * 2654435761u) & (M - 1);   // 乘散列打散
    for (int i = head[h]; i; i = nxt[i]) if (key[i] == k) return val[i];
    key[++tot] = k; val[tot] = 0; nxt[tot] = head[h]; head[h] = tot;
    return val[tot];
}
// 用 get(x) 当数组元素直接读写` },
        { h: '字符串哈希', code: raw`typedef unsigned long long ull;
const ull B = 131;                 // 自然溢出即 mod 2^64
ull h[N], pw[N];
void init(const string &s) {       // s 下标从 1 开始
    pw[0] = 1;
    for (int i = 1; i <= (int)s.size(); i++) {
        h[i] = h[i - 1] * B + s[i - 1];
        pw[i] = pw[i - 1] * B;
    }
}
ull sub(int l, int r) { return h[r] - h[l - 1] * pw[r - l + 1]; }  // 子串哈希` }
      ]
    },
    {
      id: 'a11', group: '🧮 第二部分 · 线性结构与常用技巧',
      title: '第二十二章 · 并查集', meta: 'J/S 必考 · 连通性维护',
      blocks: [
        { h: '并查集解决什么', html: raw`<p>维护一堆不相交集合，支持「合并两个集合」和「查询两个元素是否同集合」。路径压缩后单次操作近似 O(1)（严格说是反阿克曼函数 α(n)）。典型场景：Kruskal 判环、连通块计数、朋友的朋友、关押罪犯（种类并查集）、带权并查集算关系。</p>` },
        { h: '基础模板（路径压缩 + 按秩合并）', code: raw`int fa[N], sz[N];
void init(int n) { for (int i = 1; i <= n; i++) fa[i] = i, sz[i] = 1; }
int find(int x) { return fa[x] == x ? x : fa[x] = find(fa[x]); }   // 路径压缩
bool merge(int x, int y) {
    x = find(x); y = find(y);
    if (x == y) return false;
    if (sz[x] < sz[y]) swap(x, y);      // 小的挂到大的下面，保证树高
    fa[y] = x; sz[x] += sz[y];
    return true;
}` },
        { h: '种类并查集（敌人 / 关押罪犯）', html: raw`<p>「敌人的敌人是朋友」这类关系，用<b>扩展域</b>：把每个点拆成两个，i 表示「i 在 A 阵营」，i+n 表示「i 在 B 阵营」。x 与 y 敌对 → <code>merge(x, y+n), merge(x+n, y)</code>；x 与 y 友好 → <code>merge(x, y), merge(x+n, y+n)</code>。最后判 <code>find(i) == find(i+n)</code> 即矛盾。</p>` },
        { h: '带权并查集', html: raw`<p>维护「每个点到根的距离」时，在 find 里顺便把权值累加（注意路径压缩时先递归再更新）。经典：食物链（三种关系用模 3）、积木高度、区间和查询。模板关键：<code>int find(int x){ if(fa[x]==x) return x; int r=find(fa[x]); d[x]+=d[fa[x]]; return fa[x]=r; }</code>。</p>` },
        { h: '可撤销并查集', html: raw`<p>需要「撤销最后一次合并」时（线段树分治、按时间回滚），不能用路径压缩（会破坏结构），只能用<b>按秩合并</b>，并把每次 merge 的改动压栈，撤销时弹栈还原。<b>复杂度 O(log n) 每次</b>。</p>` }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第三部分 · 树与区间数据结构
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a12', group: '🌳 第三部分 · 树与区间数据结构',
      title: '第二十三章 · 树的遍历与基本性质', meta: '必考 · 一切树上问题的地基',
      blocks: [
        { h: '树的四种遍历', html: raw`<p>二叉树：先序（根左右）、中序（左根右）、后序（左右根）、层序（BFS）。由「先序 + 中序」或「后序 + 中序」可以唯一还原二叉树——做法是拿先序第一个当根，在中序里切开左右子树递归。</p>` },
        { h: '树的常见量', list: [
          '深度 / 高度：从根往下，dfs 时传递',
          '子树大小 sz[u]：后序累加子节点 sz + 1',
          '直径：两条最长的下行链之和，dfs 时维护最大值和次大值',
          '重心：删掉后最大连通块最小的点，sz 的 max(n - sz[u], max sz[v]) 取最小',
          'DFS 序（时间戳）：子树在 dfs 序里是<b>连续区间</b> [tin, tout]，树上问题转区间问题',
          '括号序：进 +1 出 -1，路径问题转前缀'
        ] },
        { h: '建树与遍历模板', code: raw`vector<int> g[N];
int sz[N], dep[N], fa[N][20], tin[N], tout[N], timer = 0;

void dfs(int u, int p) {
    fa[u][0] = p; dep[u] = dep[p] + 1;
    tin[u] = ++timer; sz[u] = 1;
    for (int v : g[u]) if (v != p) {
        dfs(v, u);
        sz[u] += sz[v];
    }
    tout[u] = timer;                      // 子树 u 对应 dfs 序区间 [tin[u], tout[u]]
}` },
        { h: '求直径（两次 DFS 或树形 DP）', code: raw`// 树形 DP：对每个点，取向下的最长和次长链相加
int ans = 0;
int dfs(int u, int p) {
    int mx1 = 0, mx2 = 0;
    for (int v : g[u]) if (v != p) {
        int d = dfs(v, u) + 1;
        if (d > mx1) { mx2 = mx1; mx1 = d; } else if (d > mx2) mx2 = d;
    }
    ans = max(ans, mx1 + mx2);            // 经过 u 的最长路径
    return mx1;                           // 返回向下的最长链
}` },
        { h: '遍历顺序的选择', html: raw`<p>要「先拿到子树信息再处理自己」→ 后序；要「先处理自己再往下传参」→ 先序；要「按层处理」→ BFS。<b>树形 DP 基本都是后序</b>（子节点算完才能算父亲），换根 DP 是先序 + 后序两遍。</p>` }
      ]
    },
    {
      id: 'a13', group: '🌳 第三部分 · 树与区间数据结构',
      title: '第二十四章 · 最近公共祖先 LCA', meta: 'S 高频 · 倍增',
      blocks: [
        { h: 'LCA 的作用', html: raw`<p>u 和 v 的最近公共祖先（LCA）是路径上深度最小的点。求出 LCA 后：树上两点距离 = <code>dep[u] + dep[v] - 2*dep[lca]</code>；u→v 路径上的点权/边权和可用「前缀和 + LCA」O(log n) 求；也是树上差分的基础。</p>` },
        { h: '倍增法：核心思想', html: raw`<p><code>fa[u][k]</code> 表示 u 往上跳 2ᵏ 步到达的点，递推 <code>fa[u][k] = fa[fa[u][k-1]][k-1]</code>。求 LCA 时：先把深的那个跳到同深度，再从大到小尝试「一起往上跳但不相等」，最后再跳一步。<b>预处理 O(n log n)，单次查询 O(log n)</b>。</p>` },
        { h: '倍增 LCA 模板', code: raw`const int LOG = 19;                  // 2^19 > 5e5
int fa[N][LOG + 1], dep[N];

void dfs(int u, int p) {
    fa[u][0] = p; dep[u] = dep[p] + 1;
    for (int k = 1; k <= LOG; k++) fa[u][k] = fa[fa[u][k-1]][k-1];
    for (int v : g[u]) if (v != p) dfs(v, u);
}

int lca(int u, int v) {
    if (dep[u] < dep[v]) swap(u, v);
    int d = dep[u] - dep[v];
    for (int k = 0; d; k++, d >>= 1) if (d & 1) u = fa[u][k];   // 拉到同深度
    if (u == v) return u;
    for (int k = LOG; k >= 0; k--)
        if (fa[u][k] != fa[v][k]) { u = fa[u][k]; v = fa[v][k]; }
    return fa[u][0];
}` },
        { h: '其他求法', list: [
          '欧拉序 + ST 表：O(n log n) 预处理、O(1) 查询，适合查询量极大时',
          'Tarjan 离线：一遍 DFS 用并查集，O(n + q) 全部查询，适合一次给很多询问',
          '树链剖分：顺带能求路径信息，写一次管多种操作',
          '暴力爬父亲：只在树很浅（随机树/菊花图）或查询极少时用'
        ] },
        { h: '易错点', html: raw`<p>① 倍增数组第二维要开够 <code>LOG+1</code>，否则 RE；② <code>fa[0][k] = 0</code>，根的父亲设成 0，dep[0] = 0；③ 递归建树前先把 <code>fa[1][0] = 0</code>；④ 多组数据要重新清空 g 和 fa。</p>` }
      ]
    },
    {
      id: 'a14', group: '🌳 第三部分 · 树与区间数据结构',
      title: '第二十五章 · 树状数组', meta: 'S 必考 · 单点改区间查',
      blocks: [
        { h: '树状数组能干什么', html: raw`<p>支持「单点修改 + 前缀查询」的 O(log n) 结构，代码只有十行。<code>lowbit(x) = x & -x</code> 取最低位的 1，树状数组第 i 项管辖 <code>[i - lowbit(i) + 1, i]</code> 这一段。</p>` },
        { h: '基础模板（点改 + 前缀和）', code: raw`int n; long long t[N];
inline int lowbit(int x) { return x & -x; }
void add(int i, long long v) { for (; i <= n; i += lowbit(i)) t[i] += v; }
long long sum(int i) { long long s = 0; for (; i > 0; i -= lowbit(i)) s += t[i]; return s; }
long long query(int l, int r) { return sum(r) - sum(l - 1); }` },
        { h: '区间改 + 单点查', html: raw`<p>用差分数组建树状数组：区间 [l, r] 加 v 变成 <code>add(l, v), add(r+1, -v)</code>，查询点 i 的值就是 <code>sum(i)</code>。这就是「差分 + 树状数组」，比线段树短得多，能做的题别写线段树。</p>` },
        { h: '区间改 + 区间查', html: raw`<p>要同时支持区间加和区间求和，需要维护两个树状数组：<code>t1</code> 存 d[i]，<code>t2</code> 存 d[i]*(i-1)，则 <code>pre(x) = x*sum(t1,x) - sum(t2,x)</code>。模板记住结论即可。</p>` },
        { h: '树状数组求逆序对 / 第 k 小', code: raw`// 逆序对：按值建树状数组，从右往左扫，ans += 已经出现的比 a[i] 小的个数
for (int i = n; i >= 1; i--) { ans += sum(a[i] - 1); add(a[i], 1); }

// 第 k 小：树上倍增走（要求树状数组存的是 0/1 计数）
int kth(int k) {
    int p = 0;
    for (int step = 1 << 19; step; step >>= 1)
        if (p + step <= n && t[p + step] < k) { p += step; k -= t[p]; }
    return p + 1;
}` }
      ]
    },
    {
      id: 'a15', group: '🌳 第三部分 · 树与区间数据结构',
      title: '第二十六章 · 线段树', meta: 'S 核心 · 区间操作的万能工具',
      blocks: [
        { h: '线段树的本质', html: raw`<p>把区间二分建成一棵二叉树，每个节点维护一段区间的汇总信息（和、最值、最大子段和……）。查询/修改时把目标区间拆成 O(log n) 个节点。<b>能用线段树的信号</b>：既要区间修改又要区间查询，且信息可合并（满足结合律）。</p>` },
        { h: '带懒标记的区间加 / 区间和', code: raw`int n; long long sum[N << 2], tag[N << 2];
void pushup(int p) { sum[p] = sum[p << 1] + sum[p << 1 | 1]; }
void apply(int p, int l, int r, long long v) { sum[p] += v * (r - l + 1); tag[p] += v; }
void pushdown(int p, int l, int r) {
    if (!tag[p]) return;
    int mid = (l + r) >> 1;
    apply(p << 1, l, mid, tag[p]); apply(p << 1 | 1, mid + 1, r, tag[p]);
    tag[p] = 0;
}
void add(int p, int l, int r, int ql, int qr, long long v) {
    if (ql <= l && r <= qr) { apply(p, l, r, v); return; }
    pushdown(p, l, r);
    int mid = (l + r) >> 1;
    if (ql <= mid) add(p << 1, l, mid, ql, qr, v);
    if (qr > mid)  add(p << 1 | 1, mid + 1, r, ql, qr, v);
    pushup(p);
}
long long ask(int p, int l, int r, int ql, int qr) {
    if (ql <= l && r <= qr) return sum[p];
    pushdown(p, l, r);
    int mid = (l + r) >> 1; long long res = 0;
    if (ql <= mid) res += ask(p << 1, l, mid, ql, qr);
    if (qr > mid)  res += ask(p << 1 | 1, mid + 1, r, ql, qr);
    return res;
}` },
        { h: '懒标记的两个前提', list: [
          '标记可叠加：比如「加」标记可以累加；「赋值」和「加」混用时，赋值要覆盖加',
          '标记可合并到孩子：apply 时能直接算出孩子的新值，不需要知道孩子内部',
          '区间乘 + 区间加：乘标记要乘到加标记上（顺序不能反），这是经典易错点',
          'pushdown 必须「先父后子」且只在真正下探时做，否则复杂度退化'
        ] },
        { h: '线段树能维护什么', list: [
          '区间和 / 最值 / 区间 gcd / 区间异或',
          '最大子段和：维护 sum、前缀最大、后缀最大、整体最大四个值',
          '区间第 k 小：值域线段树（主席树）或权值线段树合并',
          '区间加等差数列：两个懒标记（首项 + 公差）',
          '扫描线求矩形面积并：按 x 排序，线段树维护 y 方向被覆盖长度'
        ] },
        { h: '动态开点 / 线段树合并 / 主席树', html: raw`<p>值域到 10⁹ 时不能开 4n 的数组，改成<b>动态开点</b>（用一个内存池，节点用的时候才建）；要「历史版本查询」用<b>主席树</b>（可持久化线段树，每次修改只新建 log n 个节点）；要「合并两棵子树的信息」用<b>线段树合并</b>（总复杂度 O(n log n)）。这三个是 S 组压轴题的常见工具，知道原理 + 会套模板即可。</p>` }
      ]
    },
    {
      id: 'a16', group: '🌳 第三部分 · 树与区间数据结构',
      title: '第二十七章 · ST 表与 RMQ', meta: 'S 常用 · O(1) 查询',
      blocks: [
        { h: 'ST 表解决什么', html: raw`<p><b>静态</b>区间最值查询（不能修改）。预处理 <code>st[k][i]</code> = 从 i 开始长度 2ᵏ 的区间最值，递推 <code>st[k][i] = max(st[k-1][i], st[k-1][i + 2^(k-1)])</code>。查询 [l, r] 时取两个长度为 2ᵏ 的重叠区间求 max——因为 max 可重复计算，重叠不影响答案。<b>O(n log n) 预处理，O(1) 查询</b>。</p>` },
        { h: 'ST 表模板', code: raw`const int LOG = 20;
int st[LOG][N], lg[N];
void build(int n) {
    lg[1] = 0;
    for (int i = 2; i <= n; i++) lg[i] = lg[i >> 1] + 1;
    for (int k = 1; k < LOG; k++)
        for (int i = 1; i + (1 << k) - 1 <= n; i++)
            st[k][i] = max(st[k-1][i], st[k-1][i + (1 << (k-1))]);
}
int query(int l, int r) {
    int k = lg[r - l + 1];
    return max(st[k][l], st[k][r - (1 << k) + 1]);
}` },
        { h: '为什么不能求和', html: raw`<p>ST 表查询靠「两个区间重叠」，求 max/min/gcd 重叠不影响结果；但求和会重复计算重叠部分，所以<b>ST 表只能用于可重复（幂等）的运算</b>。求和要用树状数组 / 前缀和。</p>` },
        { h: 'ST 表的其他用途', list: [
          '静态区间 gcd / 区间按位与、或',
          '配合 LCA：欧拉序上的深度最小值',
          '配合二分：找「第一个大于 x 的位置」（ST 表 + 二分 O(log n)）',
          '二维 ST 表：矩形最值，O(n² log² n) 预处理'
        ] }
      ]
    },
    {
      id: 'a17', group: '🌳 第三部分 · 树与区间数据结构',
      title: '第二十八章 · 树上差分与树链剖分', meta: 'S 进阶 · 树上路径操作',
      blocks: [
        { h: '树上差分：路径加、最后统计', html: raw`<p>要给 u→v 的路径上所有点加 1，不必真的爬路径。设 <code>d[u]++, d[v]++, d[lca]--, d[fa[lca]]--</code>，最后自底向上累加子树和，每个点的值就是被覆盖次数。<b>边差分</b>改成 <code>d[u]++, d[v]++, d[lca] -= 2</code>。这是「多次路径修改 + 一次查询」的最优解，O((n+q) log n)。</p>` },
        { h: '树上差分模板', code: raw`// 路径点权 +1，最后输出每个点被覆盖次数
void mark(int u, int v) {
    int w = lca(u, v);
    d[u]++; d[v]++; d[w]--; d[fa[w][0]]--;
}
int dfs(int u, int p) {              // 后序累加
    for (int v : g[u]) if (v != p) d[u] += dfs(v, u);
    return d[u];
}` },
        { h: '树链剖分：把树拍成链', html: raw`<p>按「重儿子（子树最大的儿子）」把树剖成若干条链，每条链在 dfs 序上连续。于是「u→v 路径上的操作」可以拆成 O(log n) 段连续区间，交给线段树处理。<b>复杂度 O(log² n)</b>。求 LCA 也只要比较链头深度，比倍增常数小。</p>` },
        { h: '树剖核心模板（求 LCA 部分）', code: raw`int fa[N], dep[N], sz[N], son[N], top[N], dfn[N], timer;
void dfs1(int u, int p) {
    fa[u] = p; dep[u] = dep[p] + 1; sz[u] = 1; int mx = 0;
    for (int v : g[u]) if (v != p) {
        dfs1(v, u); sz[u] += sz[v];
        if (sz[v] > mx) mx = sz[v], son[u] = v;
    }
}
void dfs2(int u, int tp) {
    top[u] = tp; dfn[u] = ++timer;
    if (son[u]) dfs2(son[u], tp);                 // 重儿子同链
    for (int v : g[u]) if (v != fa[u] && v != son[u]) dfs2(v, v);
}
int lca(int u, int v) {
    while (top[u] != top[v]) {
        if (dep[top[u]] < dep[top[v]]) swap(u, v);
        u = fa[top[u]];
    }
    return dep[u] < dep[v] ? u : v;
}` },
        { h: '什么时候必须树上操作', html: raw`<p>题目出现「把 u 到 v 路径上的点/边全部加/赋值/查询」「查询子树和并支持修改」时，首选树剖 + 线段树。若只有「最后统计」没有询问，用树上差分；若只有子树操作，用 dfs 序 + 线段树更简单。</p>` }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第四部分 · 图论
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a18', group: '🕸 第四部分 · 图论',
      title: '第二十九章 · 图的存储与遍历', meta: '必考 · 存图是第一步',
      blocks: [
        { h: '三种存图方式', html: raw`<p><b>邻接矩阵</b> <code>g[u][v]</code>：O(n²) 空间，适合 n ≤ 1000 的稠密图、Floyd；<b>vector 邻接表</b> <code>vector&lt;int&gt; g[N]</code>：最常用，代码最短；<b>链式前向星</b>：<code>head[] + to[] + nxt[]</code>，无 vector 开销，边多时更快（10⁶ 边推荐）。</p>` },
        { h: '链式前向星模板', code: raw`int head[N], to[M << 1], nxt[M << 1], w[M << 1], ecnt = 0;
void addEdge(int u, int v, int ww) {
    to[++ecnt] = v; w[ecnt] = ww; nxt[ecnt] = head[u]; head[u] = ecnt;
}
// 无向边：addEdge(u,v,w), addEdge(v,u,w)
for (int e = head[u]; e; e = nxt[e]) { int v = to[e]; /* ... */ }` },
        { h: 'DFS 与 BFS 的区别', list: [
          'DFS：求连通块、判环、拓扑（后序）、Tarjan、二分图染色，递归写法但注意深度',
          'BFS：求无权图最短路（边权都是 1）、层次遍历、多源扩展、Flood Fill',
          'BFS 第一次访问到某点时的距离就是最短距离——这是 BFS 的核心性质',
          '网格图 4/8 方向移动都按「建邻接点」处理，用方向数组 dx[4], dy[4]'
        ] },
        { h: 'BFS 模板（无权最短路）', code: raw`int dist[N]; bool vis[N];
queue<int> q;
void bfs(int s) {
    memset(dist, 0x3f, sizeof dist);
    dist[s] = 0; vis[s] = true; q.push(s);
    while (!q.empty()) {
        int u = q.front(); q.pop();
        for (int v : g[u]) if (!vis[v]) {
            vis[v] = true; dist[v] = dist[u] + 1; q.push(v);
        }
    }
}` },
        { h: '拓扑排序', html: raw`<p>有向无环图（DAG）里，按「所有边都从前指向后」的顺序排列点。做法：统计入度，把入度为 0 的点入队，出队时把它指向的点入度减一，减到 0 就入队。<b>如果最后出队点数 &lt; n，说明有环</b>——这是判环最常用的方法（也用于「课程表/依赖关系」类题、DAG 上 DP 的求值顺序）。</p>` },
        { h: '拓扑排序模板', code: raw`int indeg[N];
queue<int> q;
for (int i = 1; i <= n; i++) if (!indeg[i]) q.push(i);
while (!q.empty()) {
    int u = q.front(); q.pop();
    order.push_back(u);
    for (int v : g[u]) if (--indeg[v] == 0) q.push(v);
}
if ((int)order.size() < n) { /* 有环 */ }` }
      ]
    },
    {
      id: 'a19', group: '🕸 第四部分 · 图论',
      title: '第三十章 · 最短路', meta: 'S 必考 · 四种算法怎么选',
      blocks: [
        { h: '一张表决定用哪个', list: [
          '边权全为 1 → BFS，O(n + m)',
          '边权为 0 或 1 → 0-1 BFS（双端队列），O(n + m)',
          '边权非负 → Dijkstra + 优先队列，O(m log n)，最常用',
          '有负边、无负环 → Bellman-Ford / SPFA，O(nm)',
          'n ≤ 400 求全源最短路 → Floyd，O(n³)',
          '有负边且要判负环 → SPFA 统计入队次数，或 Bellman-Ford 跑 n 轮'
        ] },
        { h: 'Dijkstra（优先队列优化）', code: raw`typedef pair<long long, int> pli;
long long dist[N];
void dijkstra(int s) {
    memset(dist, 0x3f, sizeof dist);
    priority_queue<pli, vector<pli>, greater<pli>> pq;
    dist[s] = 0; pq.push({0, s});
    while (!pq.empty()) {
        pli cur = pq.top(); pq.pop();
        long long d = cur.first; int u = cur.second;
        if (d > dist[u]) continue;               // 过期状态，直接跳过（关键）
        for (int e = head[u]; e; e = nxt[e]) {
            int v = to[e];
            if (dist[v] > d + w[e]) {
                dist[v] = d + w[e];
                pq.push({dist[v], v});
            }
        }
    }
}` },
        { h: 'Floyd（多源 + 传递闭包）', code: raw`// f[i][j] 初始为边权，无边为 INF，f[i][i] = 0
for (int k = 1; k <= n; k++)                 // k 必须是最外层！
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= n; j++)
            f[i][j] = min(f[i][j], f[i][k] + f[k][j]);
// 传递闭包（只关心连通性）：f[i][j] |= f[i][k] & f[k][j]` },
        { h: 'SPFA 与负环', html: raw`<p>SPFA 用队列松弛，只把「距离被更新的点」再入队。它<b>在随机图上很快，但能被卡到 O(nm)</b>——出题人只要构造网格 + 特殊边权就能卡死。判负环：记录每个点入队次数，超过 n 次即有负环。<b>能用 Dijkstra 就别用 SPFA</b>。</p>` },
        { h: '0-1 BFS 与多源最短路', html: raw`<p>边权只有 0 和 1 时，把队列换成双端队列：权 0 的边从队头入、权 1 的从队尾入，就是一个 O(n+m) 的 Dijkstra。<b>多源最短路</b>：把所有源点距离设 0 一起入队，跑一次 BFS/Dijkstra，得到每个点到「最近源点」的距离（典型题：多源扩散、火场逃生）。</p>` }
      ]
    },
    {
      id: 'a20', group: '🕸 第四部分 · 图论',
      title: '第三十一章 · 最小生成树', meta: 'S 必考 · Kruskal',
      blocks: [
        { h: '生成树与最小生成树', html: raw`<p>连通无向图的生成树是「包含全部 n 个点、恰好 n-1 条边、无环」的子图。边权和最小的那棵叫最小生成树（MST）。<b>Kruskal</b>：边按权排序，用并查集依次尝试加入，不成环就加，O(m log m)，稀疏图首选。<b>Prim</b>：从任意点开始，每次加入离当前树最近的点，O(n²) 或 O(m log n)，稠密图更合适。</p>` },
        { h: 'Kruskal 模板', code: raw`struct Edge { int u, v, w; } e[M];
bool cmp(const Edge &a, const Edge &b) { return a.w < b.w; }
sort(e, e + m, cmp);
long long ans = 0; int cnt = 0;
for (int i = 0; i < m; i++) {
    if (merge(e[i].u, e[i].v)) {          // 并查集：不同集合才加
        ans += e[i].w; cnt++;
        if (cnt == n - 1) break;
    }
}
if (cnt < n - 1) { /* 图不连通 */ }` },
        { h: 'MST 的性质（经常考）', list: [
          '任意 cut 的最小边一定属于某棵 MST（切割性质）',
          'MST 上任意两点路径是「瓶颈路」——路径上最大边权最小',
          '最小瓶颈生成树 = MST（但 MST 不唯一时，答案值相同）',
          '把边权取反求 MST 得到最大生成树',
          '删边/加边后的 MST 变化：加一条边会形成一个环，删掉环上最大边即得新 MST'
        ] },
        { h: '次小生成树', html: raw`<p>非严格次小：枚举不在 MST 上的每条边 (u,v,w)，加上它形成环，删掉 u→v 路径上的<b>最大边</b>，取所有结果的最小值。求路径最大边用倍增（或树剖）。严格次小则要维护「最大」和「次大」，当最大边等于 w 时用次大边替换。</p>` },
        { h: 'MST 与其他模型的联系', html: raw`<p>「让所有点连通的最小花费」→ MST；「最小化最大边」→ 二分 + 并查集 或 直接 MST；「每个点必须连到某个特殊点」→ 加超级源点跑 MST；「分层/多次 MST」→ 依次做。</p>` }
      ]
    },
    {
      id: 'a21', group: '🕸 第四部分 · 图论',
      title: '第三十二章 · 连通性：Tarjan 与 2-SAT', meta: 'S 进阶 · 割点/桥/缩点',
      blocks: [
        { h: '时间戳与 low 值', html: raw`<p>Tarjan 系算法的统一框架：DFS 时给每个点打时间戳 <code>dfn[u]</code>，并维护 <code>low[u]</code> = u 及其子树能回溯到的最小 dfn。核心判断都基于 dfn 与 low 的比较。</p>` },
        { h: '强连通分量 SCC（缩点）', html: raw`<p>有向图中互相可达的点构成强连通分量。Tarjan 用栈维护当前 DFS 路径，当 <code>low[u] == dfn[u]</code> 时弹栈得到一个 SCC。把每个 SCC 缩成一个点后，图变成 <b>DAG</b>，于是可以在上面做拓扑 DP（最长路、方案数、必须经过某点等）。</p>` },
        { h: '割点与桥（Tarjan）', code: raw`int dfn[N], low[N], timer, isCut[N];
void tarjan(int u, int p) {
    dfn[u] = low[u] = ++timer;
    int child = 0;
    for (int v : g[u]) {
        if (!dfn[v]) {
            child++;
            tarjan(v, u);
            low[u] = min(low[u], low[v]);
            if (low[v] >= dfn[u] && p) isCut[u] = 1;   // u 是割点
            if (low[v] > dfn[u]) { /* 边 (u,v) 是桥 */ }
        } else if (v != p) low[u] = min(low[u], dfn[v]);
    }
    if (!p && child > 1) isCut[u] = 1;                 // 根有两个以上子树
}` },
        { h: '2-SAT 一句话', html: raw`<p>每个变量只有真假两种取值、条件形如「a 为真 或 b 为真」→ 2-SAT。建图：<code>¬a → b</code>、<code>¬b → a</code>，跑 Tarjan 求 SCC。若有 <code>scc[a] == scc[¬a]</code> 则无解；否则按 SCC 编号比较确定取值（Tarjan 缩点编号是反拓扑序，取 <code>scc[a] &lt; scc[¬a]</code> 为真）。</p>` },
        { h: '点双 / 边双与圆方树', html: raw`<p>边双连通分量：删掉任意一条边仍连通（等价于「无桥」），缩点后是一棵<b>树</b>（桥树）；点双连通分量：删掉任意一个点仍连通。把点双缩成方点、原点保留，得到<b>圆方树</b>，可以处理「路径上必经过的割点」类问题。CSP-S 一般只考到缩点 + 拓扑 DP，圆方树知道概念即可。</p>` }
      ]
    },
    {
      id: 'a22', group: '🕸 第四部分 · 图论',
      title: '第三十三章 · 二分图与网络流初步', meta: 'S 选学 · 建模利器',
      blocks: [
        { h: '二分图判定', html: raw`<p>图能被分成两部分、所有边都在两部分之间 → 二分图。判定：BFS/DFS 黑白染色，相邻点必须异色，冲突则不是二分图。<b>重要结论</b>：图是二分图 ⟺ 图中没有奇环。</p>` },
        { h: '匈牙利算法求最大匹配', code: raw`int match[N]; bool vis[N];
bool dfs(int u) {
    for (int v : g[u]) {
        if (vis[v]) continue;
        vis[v] = true;
        if (!match[v] || dfs(match[v])) { match[v] = u; return true; }
    }
    return false;
}
int hungarian() {                     // 左部每个点尝试增广
    int res = 0;
    for (int u = 1; u <= n; u++) {
        memset(vis, 0, sizeof vis);
        if (dfs(u)) res++;
    }
    return res;                        // 最大匹配数
}` },
        { h: '二分图能建什么模', list: [
          '任务分配：n 个人 m 个任务，能做的连边，最大匹配 = 最多完成数',
          '棋盘覆盖：黑白染色后相邻格连边，最大匹配 = 最多骨牌数',
          '最小点覆盖 = 最大匹配（König 定理）',
          '最大独立集 = n - 最大匹配（二分图中）',
          '最小路径覆盖（DAG）= n - 拆点后最大匹配'
        ] },
        { h: '网络流：Dinic 模板', code: raw`// 只列核心：残量网络 + 分层 + 多路增广
int head[N], to[M], nxt[M], cap[M], ecnt = 1, level[N], it[N];
void addEdge(int u, int v, int c) {
    to[++ecnt] = v; cap[ecnt] = c; nxt[ecnt] = head[u]; head[u] = ecnt;
    to[++ecnt] = u; cap[ecnt] = 0; nxt[ecnt] = head[v]; head[v] = ecnt;   // 反向边
}
bool bfs(int s, int t) {
    memset(level, -1, sizeof level); level[s] = 0;
    queue<int> q; q.push(s);
    while (!q.empty()) {
        int u = q.front(); q.pop();
        for (int e = head[u]; e; e = nxt[e])
            if (cap[e] > 0 && level[to[e]] == -1) { level[to[e]] = level[u] + 1; q.push(to[e]); }
    }
    return level[t] != -1;
}
int dfs(int u, int t, int f) {
    if (u == t) return f;
    for (int &e = it[u]; e; e = nxt[e])
        if (cap[e] > 0 && level[to[e]] == level[u] + 1) {
            int d = dfs(to[e], t, min(f, cap[e]));
            if (d) { cap[e] -= d; cap[e ^ 1] += d; return d; }
        }
    return 0;
}
long long dinic(int s, int t) {
    long long flow = 0;
    while (bfs(s, t)) {
        memcpy(it, head, sizeof head);
        while (int f = dfs(s, t, 1e9)) flow += f;
    }
    return flow;
}` },
        { h: '建图套路', list: [
          '最大流 = 最小割：把「必须放弃的东西」建成容量，割掉就是代价',
          '源点连左部、右部连汇点、容量 1 → 二分图最大匹配',
          '点有容量限制：拆点成「入点 → 出点」，中间连容量为限制的边',
          '费用流：把 BFS 分层换成 SPFA 找最短路，能算「最小代价最大流」'
        ] }
      ]
    },
    {
      id: 'a23', group: '🕸 第四部分 · 图论',
      title: '第三十四章 · 差分约束与基环树', meta: 'S 进阶 · 常见变形',
      blocks: [
        { h: '差分约束：把不等式变成最短路', html: raw`<p>一堆形如 <code>x_v - x_u ≤ w</code> 的不等式，求一组可行解或某个差的最大值。做法：建边 <code>u → v</code> 权 w，跑最短路，<code>dist[v]</code> 就是满足全部约束的一组解（求最大值时跑最短路，求最小值时跑最长路）。<b>无解 ⟺ 有负环</b>。</p>` },
        { h: '三种常见不等式怎么建边', list: [
          'x_v - x_u ≤ w → add(u, v, w)',
          'x_v - x_u ≥ w → 转成 x_u - x_v ≤ -w → add(v, u, -w)',
          'x_u == x_v → add(u, v, 0) 且 add(v, u, 0)',
          '多个变量且要保证非负 → 加超级源点向所有点连 0 边'
        ] },
        { h: '基环树', html: raw`<p>n 个点 n 条边的连通图 = 一棵树 + 一条额外边，恰有一个环。处理方法：<b>先找环</b>（拓扑排序剥叶子，剩下的就是环），然后枚举「断掉环上哪条边」或「环上 DP + 树形 DP 分别算」，把环当成序列做一遍、再考虑「不选首尾」的情况（环形 DP 的经典处理）。典型题：基环树最大独立集、基环树直径。</p>` },
        { h: '找环模板（拓扑剥叶）', code: raw`queue<int> q;
for (int i = 1; i <= n; i++) if (deg[i] == 1) q.push(i);
while (!q.empty()) {
    int u = q.front(); q.pop();
    for (int v : g[u]) if (--deg[v] == 1) q.push(v);
}
// 处理完 deg[i] >= 2 的点就是环上的点` },
        { h: '图论建模的思考顺序', list: [
          '① 点是什么、边是什么（把状态/约束/物品抽象成点）',
          '② 边权是代价、距离、还是容量',
          '③ 要求的是最短路、连通性、匹配、还是最大流',
          '④ 数据范围反推算法：n ≤ 100 → Floyd；n ≤ 10⁵ → Dijkstra/并查集；n ≤ 500 且多次 → 预处理'
        ] }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第五部分 · 动态规划
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a24', group: '🧠 第五部分 · 动态规划',
      title: '第三十五章 · DP 入门与线性 DP', meta: 'S 核心 · 状态设计',
      blocks: [
        { h: 'DP 的五步法', list: [
          '① 定状态：f[i][j] 表示什么（一句话说清，含「前 i 个」「以 i 结尾」等限定）',
          '② 定转移：f[i] 由哪些更小的状态推来，写出方程',
          '③ 定初值：最小规模时的答案（f[0] = 0 或 1）',
          '④ 定顺序：保证用到的状态都已算好（通常是 i 从小到大）',
          '⑤ 定答案：是 f[n] 还是 max f[i]，还是 f[n][m]'
        ] },
        { h: '线性 DP 三件套', html: raw`<p><b>LIS（最长上升子序列）</b>：n ≤ 10⁴ 用 O(n²) 的 <code>f[i] = max(f[j]) + 1 (a[j] &lt; a[i])</code>；n ≤ 10⁶ 用贪心 + 二分维护「长度为 k 的上升子序列的最小结尾」，O(n log n)。<b>LCS（最长公共子序列）</b>：<code>f[i][j] = a[i]==b[j] ? f[i-1][j-1]+1 : max(f[i-1][j], f[i][j-1])</code>。<b>编辑距离</b>：在 LCS 基础上增加替换/删除/插入三个转移。</p>` },
        { h: 'LIS 的 O(n log n) 写法', code: raw`// 求最长严格上升子序列长度
vector<int> tail;                       // tail[k] = 长度 k+1 的上升子序列的最小结尾
for (int i = 1; i <= n; i++) {
    auto it = lower_bound(tail.begin(), tail.end(), a[i]);   // 严格上升用 lower_bound
    if (it == tail.end()) tail.push_back(a[i]); else *it = a[i];
}
int ans = tail.size();
// 不下降（允许相等）把 lower_bound 改成 upper_bound` },
        { h: 'LCS 与编辑距离', code: raw`// LCS
for (int i = 1; i <= n; i++)
    for (int j = 1; j <= m; j++)
        f[i][j] = (a[i] == b[j]) ? f[i-1][j-1] + 1 : max(f[i-1][j], f[i][j-1]);

// 编辑距离（插入/删除/替换代价均为 1）
f[i][0] = i; f[0][j] = j;
for (int i = 1; i <= n; i++)
    for (int j = 1; j <= m; j++)
        f[i][j] = min({f[i-1][j] + 1, f[i][j-1] + 1,
                       f[i-1][j-1] + (a[i] != b[j])});` },
        { h: '状态设计的常用限定词', list: [
          '「前 i 个」→ 处理到第 i 个为止（不管第 i 个选不选）',
          '「以 i 结尾」→ 强制选第 i 个，转移时从符合条件的前驱来',
          '「第 i 位填了什么」→ 数位/状压',
          '「还剩 j 次机会」→ 加一维计数',
          '「分成 j 段」→ 划分型 DP'
        ] },
        { h: '滚动数组省空间', html: raw`<p>转移只依赖上一层时，用 <code>f[i &amp; 1][...]</code> 或倒序枚举把第一维压掉。倒序枚举是 01 背包的标准做法；正序则是完全背包。空间从 O(nm) 降到 O(m)，同时提高缓存命中率。</p>` }
      ]
    },
    {
      id: 'a25', group: '🧠 第五部分 · 动态规划',
      title: '第三十六章 · 背包问题全家桶', meta: 'S/J 必考 · 一套模板解决',
      blocks: [
        { h: '四种背包的判定', list: [
          '每个物品只能取 0/1 次 → 01 背包（容量倒序枚举）',
          '每个物品可以取无限次 → 完全背包（容量正序枚举）',
          '每个物品最多取 s 个 → 多重背包（二进制拆分/单调队列）',
          '物品分组，每组最多选一个 → 分组背包（外层组、内层容量倒序、最内层组内物品）'
        ] },
        { h: '01 背包与完全背包（一维写法）', code: raw`// 01 背包：f[j] = 容量 j 能装的最大价值
for (int i = 1; i <= n; i++)
    for (int j = W; j >= w[i]; j--)          // 倒序！保证每个物品只用一次
        f[j] = max(f[j], f[j - w[i]] + v[i]);

// 完全背包：只把内层改成正序
for (int i = 1; i <= n; i++)
    for (int j = w[i]; j <= W; j++)         // 正序！允许重复选
        f[j] = max(f[j], f[j - w[i]] + v[i]);

// 恰好装满：f[0] = 0，其余 -INF；最后 f[W] < 0 表示无解` },
        { h: '多重背包的二进制拆分', code: raw`// 第 i 种物品有 c[i] 个，拆成 1,2,4,8,... 个的若干组，转成 01 背包
int k = 1;
while (c[i] > 0) {
    int take = min(k, c[i]);
    int nw = take * w[i], nv = take * v[i];
    for (int j = W; j >= nw; j--) f[j] = max(f[j], f[j - nw] + nv);
    c[i] -= take; k <<= 1;
}` },
        { h: '常见变形', list: [
          '求方案数：把 max 换成 <code>f[j] = (f[j] + f[j-w[i]]) % mod</code>，初值 f[0] = 1',
          '求「装满」的最小价值：max 换 min，初值 INF',
          '二维费用（体积 + 重量）：多一维，倒序枚举两维',
          '输出方案：记录每个物品是否被选（<code>g[i][j]</code>），最后倒推',
          '物品数量 10⁹ 但种类少 → 矩阵快速幂优化（少见）'
        ] },
        { h: '为什么 01 背包要倒序', html: raw`<p><code>f[j]</code> 从 <code>f[j-w]</code> 转移。正序枚举时 <code>f[j-w]</code> 已经在<b>本轮</b>被更新过（可能已经放了物品 i），于是物品 i 被重复使用——这正是完全背包要的效果。倒序时 <code>f[j-w]</code> 还是上一轮的值，保证只用一次。<b>这一句是背包最常考的理解题。</b></p>` }
      ]
    },
    {
      id: 'a26', group: '🧠 第五部分 · 动态规划',
      title: '第三十七章 · 区间 DP 与环形 DP', meta: 'S 高频 · 合并类问题',
      blocks: [
        { h: '区间 DP 的识别', html: raw`<p>看到「合并相邻两堆」「消去一段」「回文子序列」「括号匹配方案数」——都是区间 DP。状态 <code>f[l][r]</code> 表示区间 [l, r] 的答案，转移<b>枚举分割点 k</b>：<code>f[l][r] = min/max(f[l][k] + f[k+1][r] + cost)</code>。</p>` },
        { h: '区间 DP 模板（石子合并）', code: raw`for (int i = 1; i <= n; i++) f[i][i] = 0;
for (int len = 2; len <= n; len++)              // 先枚举区间长度
    for (int l = 1; l + len - 1 <= n; l++) {    // 再枚举左端点
        int r = l + len - 1;
        f[l][r] = INF;
        for (int k = l; k < r; k++)             // 最后枚举分割点
            f[l][r] = min(f[l][r], f[l][k] + f[k+1][r] + sum[r] - sum[l-1]);
    }
// 复杂度 O(n^3)；n ≤ 500 时约 1e8，勉强能过；再大要四边形不等式优化` },
        { h: '环形 DP 的两种处理', list: [
          '断环成链：把数组复制一份接在后面，长度 2n，答案取所有长度为 n 的区间最值',
          '分类讨论：强制「第一个选 / 不选」两种情况，分别做线性 DP 再取最优',
          '打家劫舍 II 就是第二种：分「不偷第一家」和「不偷最后一家」跑两次'
        ] },
        { h: '环形石子合并', code: raw`// 复制成 2n 长度，答案 = min over f[i][i+n-1]
for (int i = 1; i <= 2 * n; i++) a[i] = a[(i - 1) % n + 1], sum[i] = sum[i-1] + a[i];
// 之后按普通区间 DP 做，长度最多到 n
int ans = INF;
for (int i = 1; i <= n; i++) ans = min(ans, f[i][i + n - 1]);` },
        { h: '区间 DP 的优化', html: raw`<p>n 到 3000 时 O(n³) 会 TLE。若代价函数满足「四边形不等式」，决策点 k 有单调性，可用<b>决策单调性优化</b>（记录每个区间的决策点，k 只在 <code>[opt[l][r-1], opt[l+1][r]]</code> 内枚举），复杂度降到 O(n²)。</p>` }
      ]
    },
    {
      id: 'a27', group: '🧠 第五部分 · 动态规划',
      title: '第三十八章 · 树形 DP 与换根 DP', meta: 'S 必考 · 树上计数',
      blocks: [
        { h: '树形 DP 的套路', html: raw`<p>在树上做后序 DFS，每个节点合并所有子节点的答案。状态里通常带「当前节点选/不选」或「子树内选了几个」。经典：<b>没有上司的舞会</b>（<code>f[u][0] = Σ max(f[v][0], f[v][1])</code>，<code>f[u][1] = val[u] + Σ f[v][0]</code>）、<b>树的直径</b>、<b>最小点覆盖</b>、<b>树上背包</b>。</p>` },
        { h: '树形 DP 模板（最大权独立集）', code: raw`void dfs(int u, int p) {
    f[u][1] = val[u]; f[u][0] = 0;
    for (int v : g[u]) if (v != p) {
        dfs(v, u);
        f[u][1] += f[v][0];                          // 选了 u 就不能选儿子
        f[u][0] += max(f[v][0], f[v][1]);             // 不选 u，儿子随意
    }
}
int ans = max(f[root][0], f[root][1]);` },
        { h: '树上背包', html: raw`<p>「在子树里选 k 个点，容量为 m」——<code>f[u][j]</code> 表示子树 u 中选 j 个的最大价值，合并子节点时做一次背包合并。复杂度看似 O(nm²)，实际是 O(nm)（经典结论，按子树大小限制枚举上界就能证明）。</p>` },
        { h: '换根 DP', html: raw`<p>要求「以每个点为根时的答案」时，先任选根算出 <code>down[u]</code>（向下的答案），再用第二遍 DFS 把父亲的答案「传」给儿子得到 <code>up[v]</code>。典型题：求每个点到其余点的距离之和、每个点为根时的最大深度、二次扫描求树的中心。</p>` },
        { h: '换根 DP 模板（求每个点到其余点距离和）', code: raw`void dfs1(int u, int p) {                 // 第一遍：子树大小 + 子树内距离和
    sz[u] = 1; f[u] = 0;
    for (int v : g[u]) if (v != p) {
        dfs1(v, u);
        sz[u] += sz[v];
        f[u] += f[v] + sz[v];             // 每条边被算 sz[v] 次
    }
}
void dfs2(int u, int p) {                 // 第二遍：把父亲的结果推给儿子
    for (int v : g[u]) if (v != p) {
        f[v] = f[u] + (n - 2 * sz[v]);    // 换根公式：子树内少了 sz[v] 个点，外部多了 n-sz[v] 个
        dfs2(v, u);
    }
}` }
      ]
    },
    {
      id: 'a28', group: '🧠 第五部分 · 动态规划',
      title: '第三十九章 · 状压 DP', meta: 'S 高频 · n ≤ 20',
      blocks: [
        { h: '什么时候用状压', html: raw`<p>数据范围出现 <b>n ≤ 20</b>、并且需要「记住哪些元素已经被选/访问过」时，用二进制数表示集合（第 i 位为 1 表示选了 i），状态数 2ⁿ。<code>f[mask]</code> 或 <code>f[mask][i]</code>（当前在 i）。</p>` },
        { h: 'TSP 旅行商：最经典的状压 DP', code: raw`// f[mask][i] = 已访问集合 mask、当前在 i 的最小花费
memset(f, 0x3f, sizeof f);
f[1][0] = 0;
for (int mask = 1; mask < (1 << n); mask++)
    for (int i = 0; i < n; i++) if (f[mask][i] < INF)
        for (int j = 0; j < n; j++) if (!(mask >> j & 1))
            f[mask | (1 << j)][j] = min(f[mask | (1 << j)][j], f[mask][i] + w[i][j]);
long long ans = INF;
for (int i = 0; i < n; i++) ans = min(ans, f[(1 << n) - 1][i] + w[i][0]);` },
        { h: '常用位运算技巧', code: raw`int S = 1 << n;                     // 全集
mask >> i & 1                       // 判断第 i 位
mask | (1 << i)                     // 加上 i
mask & ~(1 << i)                    // 去掉 i
mask & (mask - 1)                   // 去掉最低位的 1
mask & -mask                        // 取出最低位的 1
__builtin_popcount(mask)            // 二进制中 1 的个数
for (int sub = mask; sub; sub = (sub - 1) & mask)   // 枚举子集` },
        { h: '状压 DP 的常见题型', list: [
          '棋盘放置（互不攻击）：预处理合法行状态，逐行转移',
          '集合覆盖 / 最短路上的访问顺序（TSP）',
          '子集和 DP（SOS DP）：<code>f[mask] = Σ f[mask ^ bit]</code>，O(n2ⁿ)',
          '分成若干组使每组和合法：枚举子集划分，<code>f[mask] = min(f[mask ^ sub] + 1)</code>'
        ] },
        { h: '空间与常数', html: raw`<p>2²⁰ × 20 个 long long = 160MB，会 MLE。压成一维 <code>f[mask * n + i]</code> 或直接把无用维度去掉。枚举子集的写法能减少无意义状态。另外把 <code>1 &lt;&lt; n</code> 提前算好存变量，别在循环条件里重复计算。</p>` }
      ]
    },
    {
      id: 'a29', group: '🧠 第五部分 · 动态规划',
      title: '第四十章 · 数位 DP', meta: 'S 进阶 · 计数类问题',
      blocks: [
        { h: '数位 DP 解决什么', html: raw`<p>「在 [L, R] 内有多少个数满足某性质」——逐位确定，状态里带「是否贴着上界」「是否有前导零」「上一位是什么」。答案用前缀和思想：<code>calc(R) - calc(L-1)</code>。</p>` },
        { h: '记忆化搜索写法（最好写）', code: raw`int a[20];                              // 数字的每一位
long long f[20][2][2];                  // 位置、是否顶到上界、是否有前导零
long long dfs(int pos, bool limit, bool lead) {
    if (pos == -1) return 1;            // 走完所有位，说明这个数合法
    long long &res = f[pos][limit][lead];
    if (res != -1 && !limit) return res;  // 只有不顶界时才能复用
    res = 0;
    int up = limit ? a[pos] : 9;
    for (int d = 0; d <= up; d++)
        res += dfs(pos - 1, limit && d == up, lead && d == 0);
    return res;
}
long long calc(long long x) {
    int len = 0;
    while (x) { a[len++] = x % 10; x /= 10; }
    memset(f, -1, sizeof f);
    return dfs(len - 1, true, true);
}` },
        { h: '加状态：上一位是什么', html: raw`<p>求「不含 4」「相邻位差 ≥ 2」这类条件，状态里加一维 <code>prev</code>（0~9 + 一个特殊值表示前导零）。加完维度后数组变成 <code>f[20][10][2][2]</code>，注意清空方式与记忆化条件。</p>` },
        { h: '易错点', list: [
          '有前导零时不能把「上一位 = 0」当成真的 0（否则 0 会被误判）',
          'limit 为真时不能复用记忆化结果，必须每次算',
          'L-1 可能为 -1，要特判返回 0',
          '取模题里减法写成 <code>(a - b + mod) % mod</code>'
        ] }
      ]
    },
    {
      id: 'a30', group: '🧠 第五部分 · 动态规划',
      title: '第四十一章 · DP 优化专题', meta: 'S 冲刺 · 从 O(n²) 到 O(n log n)',
      blocks: [
        { h: '优化的四种武器', list: [
          '单调队列：窗口内取最值（跳跃类、多重背包、划分型）',
          '斜率优化：转移式能写成「y 的变化量与 x 的变化量之比」，用凸包/单调栈维护',
          '决策单调性 / 四边形不等式：最优决策点随 i 单调，可用分治或指针单调扫',
          '矩阵快速幂：转移是固定线性组合且 n 极大（10¹⁸），把转移写成矩阵'
        ] },
        { h: '矩阵快速幂求斐波那契第 n 项', code: raw`struct Mat { long long a[2][2]; };
Mat mul(Mat x, Mat y) {
    Mat z{};
    for (int i = 0; i < 2; i++)
        for (int k = 0; k < 2; k++) if (x.a[i][k])
            for (int j = 0; j < 2; j++)
                z.a[i][j] = (z.a[i][j] + x.a[i][k] * y.a[k][j]) % MOD;
    return z;
}
Mat qpow(Mat b, long long e) {
    Mat r{}; r.a[0][0] = r.a[1][1] = 1;      // 单位矩阵
    while (e) { if (e & 1) r = mul(r, b); b = mul(b, b); e >>= 1; }
    return r;
}
// [f(n+1), f(n)]^T = [[1,1],[1,0]]^n * [f(1), f(0)]^T` },
        { h: '单调队列优化 DP 的样子', html: raw`<p>转移式 <code>f[i] = max(f[j] - pre[j]) + pre[i]</code>（j 在窗口内）——把和 j 有关的部分放进队列维护最大值，i 每次滑动窗口，O(n)。识别特征：<b>转移里的 j 部分可以独立成项，且 j 有区间限制</b>。</p>` },
        { h: '斜率优化何时上', html: raw`<p>当转移式形如 <code>f[i] = min(f[j] + (s[i] - s[j])²)</code> 时，展开后得到 <code>f[i] = s[i]² + min(f[j] + s[j]² - 2·s[i]·s[j])</code>，把 <code>s[j]</code> 看成 x、<code>f[j] + s[j]²</code> 看成 y，就变成「用斜率 -2s[i] 的直线切凸包」。<b>CSP-S 出现频率低，T3/T4 里偶尔出现</b>，知道思路即可，考场上优先写暴力。</p>` },
        { h: '优化的优先级建议', html: raw`<p>先确保 DP 方程正确并能拿部分分，再考虑优化。经验顺序：滚动数组（省空间/提速度）→ 前缀和/前缀最值 → 单调队列 → 决策单调性 → 斜率/矩阵。前两步能解决 80% 的「差点过」问题。</p>` }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第六部分 · 搜索
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a31', group: '🔍 第六部分 · 搜索与剪枝',
      title: '第四十二章 · DFS、BFS 与剪枝', meta: 'J/S 必考 · 骗分主力',
      blocks: [
        { h: '搜索是最后 30 分的来源', html: raw`<p>正解想不出来时，一个写得干净、剪枝到位的 DFS 往往能拿到 30~60 分。搜索题的重点不在算法，而在<b>枚举顺序 + 剪枝 + 去重</b>。</p>` },
        { h: 'DFS 回溯模板', code: raw`void dfs(int dep, int sum) {
    if (dep == n) { ans = max(ans, sum); return; }     // 出口
    for (int i = 1; i <= k; i++) {
        if (!ok(i)) continue;                          // 可行性剪枝
        vis[i] = true; used[dep] = i;
        dfs(dep + 1, sum + val[i]);
        vis[i] = false;                                // 回溯：恢复现场
    }
}` },
        { h: '五种剪枝', list: [
          '可行性剪枝：当前状态已经不可能到达合法解，直接返回',
          '最优性剪枝：当前代价已经 ≥ 已知最优，返回（前提是代价单调不减）',
          '搜索顺序优化：优先搜索「更有希望」的分支，让最优解早点出现',
          '记忆化：相同状态只算一次（把状态编码成 key 存 map）',
          '上下界剪枝：用「剩余部分的最好/最坏情况」估出答案区间，落在区间外就剪掉'
        ] },
        { h: '迭代加深与双向 BFS', html: raw`<p><b>迭代加深（IDDFS）</b>：限制搜索深度 1、2、3……逐个试，适合「答案深度浅但分支多」的题（如八数码、埃及分数），空间只有 O(depth)。<b>双向 BFS</b>：从起点和终点同时 BFS，相遇即结束，复杂度从 O(bᵈ) 降到 O(b^(d/2))。</p>` },
        { h: 'meet in the middle', html: raw`<p>n ≤ 40 的子集问题，2⁴⁰ 枚举不动。拆成两半各 2²⁰，分别枚举所有子集的结果存起来，排序后双指针/二分配对。典型：子集和等于 target 的方案数、最大异或和（配 Trie）。</p>` },
        { h: 'A* 与 IDA*', html: raw`<p>A* = BFS + 估价函数 <code>h(n)</code>（必须 ≤ 真实剩余代价，即「可采纳」），每次扩展 <code>f = g + h</code> 最小的点。IDA* = 迭代加深 + 估价剪枝（<code>g + h &gt; limit</code> 就剪）。CSP-S 考得少，八数码/十五数码类题会用到。</p>` }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第七部分 · 数学与字符串
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a32', group: '➗ 第七部分 · 数学与字符串',
      title: '第四十三章 · 数论基础', meta: 'S 高频 · gcd/筛法/快速幂/逆元',
      blocks: [
        { h: 'gcd、lcm 与扩展欧几里得', code: raw`int gcd(int a, int b) { return b ? gcd(b, a % b) : a; }
int lcm(int a, int b) { return a / gcd(a, b) * b; }   // 先除后乘防溢出

// 扩展欧几里得：求 ax + by = gcd(a,b) 的一组解
long long exgcd(long long a, long long b, long long &x, long long &y) {
    if (!b) { x = 1; y = 0; return a; }
    long long d = exgcd(b, a % b, y, x);
    y -= a / b * x;
    return d;
}` },
        { h: '线性筛（同时求欧拉函数、约数个数）', code: raw`int prime[N], cnt = 0; bool notp[N];
void sieve(int n) {
    for (int i = 2; i <= n; i++) {
        if (!notp[i]) prime[++cnt] = i;
        for (int j = 1; j <= cnt && i * prime[j] <= n; j++) {
            notp[i * prime[j]] = true;
            if (i % prime[j] == 0) break;      // 保证每个合数只被最小质因子筛一次
        }
    }
}
// 复杂度 O(n)，比埃氏筛 O(n log log n) 更快且能顺带算积性函数` },
        { h: '快速幂与逆元', code: raw`long long qpow(long long a, long long e, long long mod) {
    long long r = 1; a %= mod;
    while (e) { if (e & 1) r = r * a % mod; a = a * a % mod; e >>= 1; }
    return r;
}
// 模数为质数：a 的逆元 = a^(p-2) % p
long long inv(long long a, long long p) { return qpow(a, p - 2, p); }
// 线性求 1..n 的逆元
inv[1] = 1;
for (int i = 2; i <= n; i++) inv[i] = (mod - mod / i) * inv[mod % i] % mod;` },
        { h: '唯一分解与中国剩余定理', html: raw`<p>任何数可唯一分解为质因子幂的乘积（试除到 √n 即可，O(√n)）。<b>CRT（中国剩余定理）</b>：解同余方程组 <code>x ≡ aᵢ (mod mᵢ)</code>，模数两两互质时用「乘逆元构造」，不互质时用扩展 CRT（合并方程）。CSP-S 里 CRT 直接考察不多，但「模数不是质数时怎么求逆元」「模数分解后分别算再合并」是常见思路。</p>` },
        { h: '常见数论结论速查', list: [
          'n 以内的质数个数约 n / ln n；10⁷ 以内约 66 万个',
          '约数个数上限：10⁹ 以内最多 1344 个 → 可以枚举约数',
          '<code>a/b mod p</code> 要写成 <code>a * inv(b) % p</code>',
          '同余方程 <code>ax ≡ b (mod m)</code> 有解 ⟺ gcd(a,m) | b',
          '2 的幂、逆元的周期性可以用来做循环节（如分数化小数）'
        ] }
      ]
    },
    {
      id: 'a33', group: '➗ 第七部分 · 数学与字符串',
      title: '第四十四章 · 组合数学与概率期望', meta: 'S 常考 · 计数题',
      blocks: [
        { h: '组合数的三种求法', code: raw`// ① 递推（n ≤ 2000）：杨辉三角
C[i][j] = (C[i-1][j-1] + C[i-1][j]) % mod;

// ② 阶乘 + 逆元（n ≤ 10^6，mod 为质数）
fac[0] = 1;
for (int i = 1; i <= n; i++) fac[i] = fac[i-1] * i % mod;
inv_fac[n] = qpow(fac[n], mod - 2, mod);
for (int i = n; i; i--) inv_fac[i-1] = inv_fac[i] * i % mod;
inline long long C(int n, int m) {
    if (m < 0 || m > n) return 0;
    return fac[n] * inv_fac[m] % mod * inv_fac[n-m] % mod;
}` },
        { h: '必须记住的计数模型', list: [
          '排列 A(n,m) = n!/(n-m)!，组合 C(n,m)',
          '可重复组合（隔板法）：C(n+m-1, m-1)',
          '错排：D(n) = (n-1)(D(n-1) + D(n-2))，D(1)=0, D(2)=1',
          '卡特兰数：C(2n,n)/(n+1)，对应「括号序列、出栈顺序、二叉树形态」',
          '容斥：|A∪B∪C| = Σ|A| - Σ|A∩B| + |A∩B∩C|',
          '二项式定理：(a+b)ⁿ = Σ C(n,k) aᵏ b^(n-k)',
          'Lucas 定理：mod 为小质数时 C(n,m) mod p = C(n%p, m%p) * C(n/p, m/p)'
        ] },
        { h: '容斥模板（1..n 中与 m 互质的个数）', code: raw`// 先分解 m 的质因子，再容斥
int ans = n;
for (int mask = 1; mask < (1 << k); mask++) {
    long long prod = 1; int bits = 0;
    for (int i = 0; i < k; i++) if (mask >> i & 1) prod *= p[i], bits++;
    if (bits & 1) ans -= n / prod; else ans += n / prod;
}` },
        { h: '期望的线性性', html: raw`<p><code>E(X + Y) = E(X) + E(Y)</code> 永远成立，不管是否独立——这是期望题最好用的性质：<b>把总期望拆成每个小事件的期望之和</b>。例如「随机排列的逆序对期望」= 每一对 (i,j) 贡献的概率之和 = C(n,2) × 1/2。概率期望题注意分数取模：<code>p/q</code> 存成 <code>p * inv(q)</code>。</p>` },
        { h: 'DP 求期望', html: raw`<p>期望 DP 通常<b>倒着推</b>：<code>E[i]</code> 表示「从状态 i 到结束的期望步数」，转移 <code>E[i] = 1 + Σ p·E[next]</code>。概率 DP 则正着推：<code>f[i]</code> 表示到达状态 i 的概率。</p>` }
      ]
    },
    {
      id: 'a34', group: '➗ 第七部分 · 数学与字符串',
      title: '第四十五章 · 矩阵与高斯消元', meta: 'S 选学 · 线性代数工具',
      blocks: [
        { h: '矩阵乘法与快速幂', html: raw`<p>矩阵乘法 <code>C[i][j] = Σ A[i][k]·B[k][j]</code>，复杂度 O(n³)。用它做「线性递推的加速」：把转移写成矩阵，n 次转移就是矩阵的 n 次幂，配合快速幂 O(n³ log n)。注意<b>矩阵乘法不满足交换律</b>，写 <code>r = mul(r, b)</code> 的顺序别反。</p>` },
        { h: '高斯消元（解线性方程组）', code: raw`// a[n][n+1]：增广矩阵，解回填到 a[i][n]
for (int i = 1; i <= n; i++) {
    int p = i;
    for (int j = i; j <= n; j++) if (fabs(a[j][i]) > fabs(a[p][i])) p = j;  // 选主元
    if (fabs(a[p][i]) < eps) { /* 无唯一解 */ }
    swap(a[i], a[p]);
    for (int j = n + 1; j >= i; j--) a[i][j] /= a[i][i];       // 归一
    for (int k = 1; k <= n; k++) if (k != i)
        for (int j = n + 1; j >= i; j--) a[k][j] -= a[k][i] * a[i][j];
}
// 此时 a[i][n+1] 就是 x_i` },
        { h: '异或方程组与 bitset 加速', html: raw`<p>方程形如「若干变量的异或 = 常数」时，系数只有 0/1，用 <code>bitset&lt;N&gt;</code> 存一行，消元时整行异或，复杂度从 O(n³) 降到 O(n³/64)。典型题：开关灯问题、线性基（求最大异或和）。</p>` },
        { h: '线性基（求最大异或和）', code: raw`long long b[64];
void insert(long long x) {
    for (int i = 62; i >= 0; i--) if (x >> i & 1) {
        if (!b[i]) { b[i] = x; return; }
        x ^= b[i];
    }
}
long long queryMax() {
    long long res = 0;
    for (int i = 62; i >= 0; i--) res = max(res, res ^ b[i]);
    return res;
}` }
      ]
    },
    {
      id: 'a35', group: '➗ 第七部分 · 数学与字符串',
      title: '第四十六章 · 高精度运算', meta: 'J 常考 · 大数加减乘除',
      blocks: [
        { h: '什么时候需要高精度', html: raw`<p>当数值超过 <code>unsigned long long</code>（约 1.8×10¹⁹），而题目又要求精确结果时——典型是「2 的 1000 次方」「100! 的位数」「两个 500 位整数相加」。CSP-J 常考，CSP-S 一般用取模回避。</p>` },
        { h: '高精度加减乘（string 版，最好写）', code: raw`string add(string a, string b) {          // 两个非负整数相加
    reverse(a.begin(), a.end()); reverse(b.begin(), b.end());
    string c; int carry = 0;
    for (int i = 0; i < (int)max(a.size(), b.size()) || carry; i++) {
        int s = carry + (i < (int)a.size() ? a[i] - '0' : 0)
                       + (i < (int)b.size() ? b[i] - '0' : 0);
        c += char('0' + s % 10); carry = s / 10;
    }
    reverse(c.begin(), c.end());
    return c;
}
string mul(string a, long long b) {      // 大数乘小数
    reverse(a.begin(), a.end());
    string c; long long carry = 0;
    for (int i = 0; i < (int)a.size() || carry; i++) {
        long long cur = carry + (i < (int)a.size() ? (a[i] - '0') * b : 0);
        c += char('0' + cur % 10); carry = cur / 10;
    }
    reverse(c.begin(), c.end());
    return c;
}` },
        { h: '大数除法与取模', html: raw`<p>除以小数：从高位开始逐位「余数 × 10 + 当前位」除以除数，商拼起来、余数继续。<b>高精度除以高精度</b>要用减法模拟（或二分商），代码量大，CSP 里基本不考，遇到就用 Python 口算或写成大数类。</p>` },
        { h: '省事写法', list: [
          '只需要比较大小/加一：用 string 比较（先比长度再比字典序）',
          '需要乘除 + 输出：写成 struct BigInt（数组存低位在前，重载运算符）',
          'Python 允许用（有些考场不给），否则老老实实手写',
          '注意去掉前导零、处理 0 的情况'
        ] }
      ]
    },
    {
      id: 'a36', group: '➗ 第七部分 · 数学与字符串',
      title: '第四十七章 · 字符串算法', meta: 'S 高频 · KMP / Trie / AC 自动机',
      blocks: [
        { h: 'KMP：单模式串匹配', html: raw`<p>求模式串 p 在文本串 s 中出现的所有位置。核心是 <code>nxt[i]</code>（p 的前 i 个字符的「最长相等前后缀」长度），失配时按 nxt 跳而不是回到开头，总复杂度 O(n+m)。<b>nxt 数组也是很多字符串 DP 的基础</b>（如「最小循环节 = n - nxt[n]」）。</p>` },
        { h: 'KMP 模板', code: raw`int nxt[N];
void build(const string &p) {          // p 下标从 1 开始
    nxt[1] = 0;
    for (int i = 2, j = 0; i <= (int)p.size() - 1; i++) {
        while (j && p[i] != p[j + 1]) j = nxt[j];
        if (p[i] == p[j + 1]) j++;
        nxt[i] = j;
    }
}
void match(const string &s, const string &p) {
    for (int i = 1, j = 0; i <= (int)s.size() - 1; i++) {
        while (j && s[i] != p[j + 1]) j = nxt[j];
        if (s[i] == p[j + 1]) j++;
        if (j == (int)p.size() - 1) { /* 在 i - j + 1 处匹配 */ j = nxt[j]; }
    }
}` },
        { h: 'Trie 字典树', code: raw`int ch[N][26], cnt[N], tot = 0;
void insert(const string &s) {
    int u = 0;
    for (char c : s) {
        int v = c - 'a';
        if (!ch[u][v]) ch[u][v] = ++tot;
        u = ch[u][v];
    }
    cnt[u]++;                       // 该词出现次数
}
// 用途：前缀查询、异或最大值（01 Trie）、字符串排序、AC 自动机的基础` },
        { h: 'AC 自动机（多模式串匹配）', html: raw`<p>Trie + KMP 思想：在 Trie 上建 <code>fail</code> 指针（BFS 求，指向「最长的真后缀且是某个前缀」的节点），匹配时沿着 fail 跳。复杂度 O(总长 + 文本长)。考场上写起来长，CSP-S 出现频率中等，建议背模板。</p>` },
        { h: 'Manacher 与回文', html: raw`<p>求最长回文子串：Manacher 在 O(n) 内求出以每个位置为中心的最长回文半径。做法是插入分隔符把奇偶统一，利用「已知回文的对称性」跳过重复计算。<b>字符串哈希 + 二分</b>也能 O(n log n) 求，更好写。</p>` }
      ]
    },
    {
      id: 'a37', group: '➗ 第七部分 · 数学与字符串',
      title: '第四十八章 · 计算几何基础', meta: 'S 偶考 · 向量与凸包',
      blocks: [
        { h: '向量的基本运算', code: raw`struct P { double x, y; };
P operator+(P a, P b) { return {a.x + b.x, a.y + b.y}; }
P operator-(P a, P b) { return {a.x - b.x, a.y - b.y}; }
double cross(P a, P b) { return a.x * b.y - a.y * b.x; }   // 叉积（有向面积 2 倍）
double dot(P a, P b)   { return a.x * b.x + a.y * b.y; }   // 点积
double len(P a) { return sqrt(dot(a, a)); }
double area(P a, P b, P c) { return cross(b - a, c - a) / 2; }` },
        { h: '叉积的三个用途', list: [
          '判方向：cross(b-a, c-a) > 0 表示 c 在 ab 左侧（逆时针）',
          '判三点共线：cross == 0',
          '求多边形面积：按顺序把相邻点与原点构成的叉积累加再取绝对值除以 2'
        ] },
        { h: '凸包（Andrew 扫描法）', code: raw`sort(p, p + n, [](P a, P b){ return a.x != b.x ? a.x < b.x : a.y < b.y; });
int m = 0;
for (int i = 0; i < n; i++) {
    while (m >= 2 && cross(hull[m-1] - hull[m-2], p[i] - hull[m-2]) <= 0) m--;
    hull[m++] = p[i];
}
int k = m;
for (int i = n - 2; i >= 0; i--) {
    while (m > k && cross(hull[m-1] - hull[m-2], p[i] - hull[m-2]) <= 0) m--;
    hull[m++] = p[i];
}
// hull[0..m-2] 就是凸包顶点（逆时针）` },
        { h: '精度问题', html: raw`<p>几何题最大的敌人是精度。三条原则：① 比较大小用 <code>eps = 1e-9</code>，写成 <code>if (a - b &gt; eps)</code>；② 能用整数就不用浮点（叉积全用 long long，面积用 2 倍存）；③ 避免「先算斜率再比较」，改成叉积判方向。</p>` }
      ]
    }
  );

  /* ══════════════════════════════════════════════════════
   * 第八部分 · 综合与实战
   * ══════════════════════════════════════════════════════ */
  nodes.push(
    {
      id: 'a38', group: '🎯 第八部分 · 综合与实战',
      title: '第四十九章 · 位运算与 bitset 加速', meta: 'S 常用 · 常数优化',
      blocks: [
        { h: '位运算速查', code: raw`x << 1        // 乘 2
x >> 1        // 除 2（向下取整）
x & 1         // 判奇偶
x & -x        // 最低位的 1（lowbit）
x & (x - 1)   // 去掉最低位的 1
__builtin_popcount(x)      // 1 的个数
__builtin_ctz(x)           // 末尾 0 的个数
__builtin_clz(x)           // 前导 0 的个数
(x ^ y) < 0                // 异号判断（避免溢出）
x ^= y ^= x ^= y           // 交换（不推荐，可读性差）` },
        { h: 'bitset 把 O(n) 变 O(n/64)', html: raw`<p><code>bitset&lt;N&gt; b;</code> 支持 <code>b &amp; c</code>、<code>b | c</code>、<code>b &lt;&lt; k</code>、<code>b.count()</code>，一次操作处理 64 位。<b>典型用法</b>：可达性 DP（<code>f |= f &lt;&lt; w</code> 实现背包）、集合交并、求传递闭包（Floyd 的 bitset 版，O(n³/64)）。</p>` },
        { h: 'bitset 做背包', code: raw`bitset<1000005> f;
f[0] = 1;
for (int i = 1; i <= n; i++) f |= (f << w[i]);     // 每个物品用一次
// 完全背包：f |= f << w 后再 f |= f << w ... 或用循环
cout << f.count();                                  // 能凑出的不同和的数量` },
        { h: 'getchar 快读与位运算技巧', html: raw`<p>快速读入整数时，常见的写法是 <code>x = (x &lt;&lt; 3) + (x &lt;&lt; 1) + (c ^ 48)</code>（等于 x*10 + 数字），比乘 10 稍快。这类微优化只在极限卡常时才有意义，平时写清楚更重要。</p>` },
        { h: '状态压缩的思想', html: raw`<p>把「若干个 bool」压进一个整数/位集，是状压 DP、bitset 优化、集合运算的共同基础。看到一个集合只要 20 个元素以内、并且操作是「并/交/补/判断包含」，就应该想到位运算。</p>` }
      ]
    },
    {
      id: 'a39', group: '🎯 第八部分 · 综合与实战',
      title: '第五十章 · 常见模型与转化套路', meta: 'S 冲刺 · 读题到建模',
      blocks: [
        { h: '把题读成模型：五类信号', list: [
          '「最少 / 最多 / 是否可行」+ 单调 → 二分答案',
          '「区间加、区间和、区间最值」→ 前缀和 / 树状数组 / 线段树',
          '「连通、合并集合、是否同组」→ 并查集（或缩点）',
          '「第 k 大/小、动态更新」→ 堆 / 值域线段树 / 平衡树',
          '「方案数、最优值、有阶段划分」→ DP（先想状态再想转移）'
        ] },
        { h: '八种常见转化', list: [
          '最大化最小值 / 最小化最大值 → 二分答案 + 贪心 check',
          '「恰好 k 个」→ 加一维计数，或者「至多 k」相减',
          '「不存在…」→ 补集计数（总数 - 存在）',
          '「至少选一个」→ 总数 - 一个都不选',
          '路径问题 → 拆点（点拆成入点出点）或分层图（状态作为新维度）',
          '树上路径 → 差分 / 树剖 / LCA',
          '序列分段 → DP + 前缀和 / 单调队列优化',
          '二维网格 → 按行状压 / 按列扫描线'
        ] },
        { h: '分层图最短路', html: raw`<p>「可以免费走 k 条边」「状态会切换」这类题，把状态做成新的一维：<code>dist[u][j]</code> 表示「到 u 用了 j 次特权」的最短路，边在层内和层间转移。点数变成 n×(k+1)，直接跑 Dijkstra。</p>` },
        { h: '拆点与超级源汇', list: [
          '点有容量/次数限制 → 拆成「入点 → 出点」中间连限制边',
          '多个起点 → 超级源点连所有起点（容量/权为 0）',
          '多个终点 → 全部连到超级汇点',
          '「必须经过某点」→ 拆成两段最短路相加'
        ] },
        { h: '部分分策略', html: raw`<p>CSP-S 一题 100 分，通常有 5~10 个测试点。策略：<b>先写 O(n²) 暴力拿 40~60 分，再想正解</b>。特殊性质（链、树、全是 1、无修改）往往单独给点，写几个特判就能多拿 20 分。宁可四题各 40 分，不要一题 100 分其余爆零。</p>` }
      ]
    },
    {
      id: 'a40', group: '🎯 第八部分 · 综合与实战',
      title: '第五十一章 · 卡常、对拍与提交前检查', meta: '实战 · 把分拿到手',
      blocks: [
        { h: '卡常的合法手段', list: [
          '关同步 + 不用 endl（最有效，几乎零成本）',
          '把常用量提到循环外（数组大小、边界、取模常量）',
          '多维数组把小的维度放前面（提高缓存命中）',
          '用 int 而非 long long 做中间计算（只在确定不溢出时）',
          '把函数写成 inline / 用数组代替 vector',
          '取模时先加再判断，减少一次 %（<code>if (x &gt;= mod) x -= mod;</code>）',
          '循环展开、位运算代替乘除（收益小，慎用）'
        ] },
        { h: '对拍：找 bug 的最强手段', html: raw`<p>写一个暴力（保证正确但慢）+ 一个数据生成器 + 一个比较脚本，循环跑几百组小数据。发现不同就停下来看那组数据——<b>90% 的 WA 都能这样定位</b>。CSP-S 考场时间紧，至少对拍 5 分钟。</p>` },
        { h: '对拍脚本思路', code: raw`# Linux / NOI Linux 下的对拍（bash）
for ((i=1; i<=1000; i++)); do
    ./gen > in.txt            # 生成数据
    ./brute < in.txt > b.out  # 暴力
    ./fast  < in.txt > f.out  # 你的程序
    if ! diff -q b.out f.out > /dev/null; then
        echo "WA on case $i"; break
    fi
done` },
        { h: '提交前 8 条检查', list: [
          '文件名对吗（题目指定 <code>xxx.cpp</code>，注意大小写）',
          'freopen 注释掉了吗（提交版必须用标准输入输出）',
          '数组开够了吗（多开 5~10 个，边数开 2 倍）',
          '多组数据清空了吗（g、head、vis、ans、标记数组）',
          'long long 用对了吗（乘法、求和、答案）',
          '取模每步都取了吗，减法处理负数了吗',
          '边界 n=1、m=0、全部相同、最大值试过了吗',
          '本地能编译通过吗（提交前一定要本地编译一遍）'
        ] },
        { h: '考场时间分配（4 题 3.5 小时）', html: raw`<p>建议：前 20 分钟通读四题 + 想暴力；T1 用 30 分钟写对写稳；T2 用 50 分钟争取正解；剩下 90 分钟先给 T3/T4 各写暴力（各 25 分钟），再用剩余时间攻其中一道的正解；最后 15 分钟检查文件、编译、提交。<b>永远留时间检查</b>。</p>` }
      ]
    }
  );
})();
