/* 复习端精讲数据 —— 随仓库发布，运行时由 review.js 读取
 * 每道题包含：strategy 思路精讲 / code 参考代码（可在编辑器运行）/ complexity 复杂度
 *            pitfalls 易错点（数组）/ walk 样例演示
 */
window.REVIEWS = {

  queue: {
    strategy:
      '这是一道「单窗口排队」模拟题。核心是按时间顺序处理每个人的到达与离开：如果窗口当前空闲（上一人离开时间 ≤ 当前人到达时间），则到达即开始服务；否则需要等上一个人离开。' +
      '用变量 <code>free</code> 记录窗口下一次空闲的时刻，每人的离开时间 = max(到达时间, free) + 服务时间，随后更新 free。注意到达时间可能乱序，要先按到达时间排序。',
    code:
      '#include <iostream>\n' +
      '#include <algorithm>\n' +
      'using namespace std;\n' +
      'struct P { long long a, s; } p[100005];\n' +
      'bool cmp(P x, P y){ return x.a < y.a; }\n' +
      'int main(){\n' +
      '  int n; cin >> n;\n' +
      '  for (int i = 0; i < n; i++) cin >> p[i].a >> p[i].s;\n' +
      '  sort(p, p + n, cmp);\n' +
      '  long long free = 0;\n' +
      '  for (int i = 0; i < n; i++){\n' +
      '    if (free < p[i].a) free = p[i].a;\n' +
      '    free += p[i].s;\n' +
      '    cout << free << "\\n";\n' +
      '  }\n' +
      '  return 0;\n' +
      '}',
    complexity: '排序 O(n log n)，扫描 O(n)，总复杂度 O(n log n)，空间 O(n)。',
    pitfalls: [
      '到达时间和离开时间要用 long long，n 大时累计会超 int。',
      '必须按到达时间排序后再处理，题目给的顺序不一定有序。',
      '空闲窗口的判断是 free < a[i]，等于时也要立刻开始（不额外等待）。'
    ],
    walk: '例：n=2，(到达=1,服务=3)、(到达=2,服务=2)。第 1 人 1+3=4 离开；第 2 人 2<4 需等待，4+2=6 离开。'
  },

  decode: {
    strategy:
      '字符串解码题，形如 <code>3[a]2[bc]</code> → <code>aaabcbc</code>。典型做法是栈：遇到字母直接暂存；遇到数字累积成多位整数；遇到 <code>[</code> 把「当前已解码串」和「待重复次数」入栈；遇到 <code>]</code> 弹出，把栈顶串重复 k 次后拼回当前串。' +
      '难点在多位数字（如 <code>10[ab]</code>）和嵌套。用「当前串 cur + 当前重复数 k」两个栈配对即可。',
    code:
      '#include <iostream>\n' +
      '#include <string>\n' +
      '#include <vector>\n' +
      'using namespace std;\n' +
      'string decode(string s){\n' +
      '  vector<string> st; vector<int> num;\n' +
      '  string cur = ""; int k = 0;\n' +
      '  for (char c : s){\n' +
      '    if (c >= \'0\' && c <= \'9\') k = k * 10 + (c - \'0\');\n' +
      '    else if (c == \'[\'){ st.push_back(cur); num.push_back(k); cur = ""; k = 0; }\n' +
      '    else if (c == \']\'){ string t = cur, base = st.back(); st.pop_back(); int r = num.back(); num.pop_back(); cur = base; for (int i=0;i<r;i++) cur += t; }\n' +
      '    else cur += c;\n' +
      '  }\n' +
      '  return cur;\n' +
      '}\n' +
      'int main(){ string s; cin >> s; cout << decode(s) << "\\n"; return 0; }',
    complexity: '每个字符进出栈一次，O(n)，空间 O(n)（最坏嵌套深度）。',
    pitfalls: [
      '数字可能是多位数，必须累积 k = k*10 + d，不能只取单字符。',
      '嵌套时要把「外层已解出的串」也压栈，弹栈后拼回去而不是覆盖。',
      '栈为空（无括号）时直接输出 cur。'
    ],
    walk: '解 <code>3[a]2[bc]</code>：a 重复 3 次 → aaa；bc 重复 2 次 → bcbc；拼接得 aaabcbc。'
  },

  gridpath: {
    strategy:
      '网格路径计数：从左上角走到右下角，每次只能向右或向下，问不同路径数。这是经典 DP：<code>dp[i][j] = dp[i-1][j] + dp[i][j-1]</code>，边界 dp=1。' +
      '如果网格带障碍，则障碍格 dp=0。结果可能很大，记得对给定模数取模或开 long long。也可理解为组合数 C(m+n, n)。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'long long dp[1005][1005];\n' +
      'int main(){\n' +
      '  int n, m; cin >> n >> m;\n' +
      '  for (int i = 1; i <= n; i++)\n' +
      '    for (int j = 1; j <= m; j++)\n' +
      '      dp[i][j] = (i==1 && j==1) ? 1 : dp[i-1][j] + dp[i][j-1];\n' +
      '  cout << dp[n][m] << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: 'O(n·m) 时间与空间。无障碍时退化为组合数 O(1) 计算。',
    pitfalls: [
      '结果可能很大，用 long long（甚至取模），int 会溢出。',
      '边界处理：第一行/第一列只有一条路，dp=1。',
      '下标从 1 开始更直观，注意 n、m 与行列的对应关系。'
    ],
    walk: '2×3 网格：dp[2][3]=3 条路径（右右+下，右+下+右，下+右右 等不同组合，实际 = C(3,1)=3）。'
  },

  cover: {
    strategy:
      '区间覆盖题：给定若干线段，求最少用几条能把目标区间 [1, T] 完整覆盖。贪心策略：先把所有区间按左端点排序，每次在「左端点 ≤ 当前已覆盖位置 next」的区间里，选右端点最大的那个，把 next 推进到它的右端点，重复直到覆盖 T。' +
      '如果某步没有区间能接上，则无解。这是「区间覆盖」模板，和「选择最多不相交区间」是不同的题。',
    code:
      '#include <iostream>\n' +
      '#include <algorithm>\n' +
      'using namespace std;\n' +
      'struct Seg { int l, r; } a[100005];\n' +
      'bool cmp(Seg x, Seg y){ return x.l < y.l; }\n' +
      'int main(){\n' +
      '  int n, T; cin >> n >> T;\n' +
      '  for (int i = 0; i < n; i++) cin >> a[i].l >> a[i].r;\n' +
      '  sort(a, a + n, cmp);\n' +
      '  int cnt = 0, i = 0, next = 1;\n' +
      '  while (next <= T){\n' +
      '    int far = next - 1;\n' +
      '    while (i < n && a[i].l <= next){ if (a[i].r > far) far = a[i].r; i++; }\n' +
      '    if (far < next){ cout << "-1\\n"; return 0; }\n' +
      '    next = far + 1; cnt++;\n' +
      '  }\n' +
      '  cout << cnt << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: '排序 O(n log n) + 扫描 O(n)，总 O(n log n)。',
    pitfalls: [
      '贪心标准是「左端点 ≤ next 中选右端点最大」，不是选最短或最早结束的。',
      '无解要判：当前能选的区间右端点都到不了 next，直接 -1。',
      '循环边界：next 用「已覆盖到 next-1」，选完推进到 far+1。'
    ],
    walk: '区间 [1,3],[2,5],[6,8]，T=8：选 [1,3]→覆盖到 3，再选 [2,5]→覆盖到 5，再选 [6,8]→覆盖到 8，共 3 条。'
  },

  brackets: {
    strategy:
      '括号序列求「最长有效括号子串长度」。用栈：遇到 <code>(</code> 把下标入栈；遇到 <code>)</code> 若栈非空则弹出（匹配），当前有效长度 = 当前位置 - 栈顶下标（栈顶是「最后一个未匹配位置」）。栈空时把当前下标压入作为基准。' +
      '另一种思路是左右各扫一遍统计。注意这是子串（连续），和「能否完全匹配」不是一回事。',
    code:
      '#include <iostream>\n' +
      '#include <string>\n' +
      '#include <vector>\n' +
      'using namespace std;\n' +
      'int main(){\n' +
      '  string s; cin >> s; int n = s.size(), ans = 0;\n' +
      '  vector<int> st; st.push_back(-1);\n' +
      '  for (int i = 0; i < n; i++){\n' +
      '    if (s[i] == \'(\') st.push_back(i);\n' +
      '    else { st.pop_back(); if (st.empty()) st.push_back(i); else { int len = i - st.back(); if (len > ans) ans = len; } }\n' +
      '  }\n' +
      '  cout << ans << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: 'O(n) 一次扫描，空间 O(n) 栈。',
    pitfalls: [
      '栈里存的是「下标」不是字符，便于算长度。',
      '先压入 -1 作为左边界基准，避免栈空时越界。',
      '题目是「最长有效括号子串（连续）」，不是括号是否匹配。'
    ],
    walk: '对 <code>(()</code>：匹配前缀长度 2；对 <code>)()())</code>：最长有效段 <code>()()</code> 长度 4。'
  },

  maxsub: {
    strategy:
      '最大子段和（连续子数组最大和），用 Kadane 算法：维护「以当前位置结尾的最大子段和」cur，与全局最大值 ans。' +
      'cur = max(cur + a[i], a[i])，即「接上前面」或「从自己重新开始」取大；每步用 cur 更新 ans。O(n) 解决，注意全负时答案为最大那个负数。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'int main(){\n' +
      '  int n; cin >> n;\n' +
      '  long long ans = -1e18, cur = 0, x;\n' +
      '  for (int i = 0; i < n; i++){ cin >> x; cur = (cur > 0 ? cur + x : x); if (cur > ans) ans = cur; }\n' +
      '  cout << ans << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: 'O(n) 时间，O(1) 空间。',
    pitfalls: [
      '全是负数时答案应是最大的负数，初始化 ans 为一个很小的值而非 0。',
      'cur 重置规则是「cur>0 才接上」，等于 0 时从当前开始更优。',
      '用 long long，数据可能很大。'
    ],
    walk: '序列 -2 1 -3 4 -1 2 1 -5 4：最大子段 [4,-1,2,1] 和为 6。'
  },

  tree: {
    strategy:
      '树的直径 = 树上最远两点的距离。标准做法两次搜索：先从任意点（如 1 号）BFS/DFS 找到离它最远的点 u；再从 u 出发 BFS/DFS 找到离 u 最远的点 v，u 到 v 的距离就是直径。' +
      '本质是无环图上的最远点对，用邻接表存边、边权累加距离即可。',
    code:
      '#include <iostream>\n' +
      '#include <vector>\n' +
      'using namespace std;\n' +
      'vector<int> g[100005];\n' +
      'int dist[100005];\n' +
      'void dfs(int u, int fa, int d){\n' +
      '  dist[u] = d;\n' +
      '  for (int v : g[u]) if (v != fa) dfs(v, u, d + 1);\n' +
      '}\n' +
      'int main(){\n' +
      '  int n; cin >> n;\n' +
      '  for (int i = 1; i < n; i++){ int u, v; cin >> u >> v; g[u].push_back(v); g[v].push_back(u); }\n' +
      '  dfs(1, 0, 0); int u = 1; for (int i = 1; i <= n; i++) if (dist[i] > dist[u]) u = i;\n' +
      '  dfs(u, 0, 0); int ans = 0; for (int i = 1; i <= n; i++) if (dist[i] > ans) ans = dist[i];\n' +
      '  cout << ans << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: '两次 DFS O(n)，空间 O(n)。',
    pitfalls: [
      'DFS 必须记录父节点 fa 防止回边死循环。',
      '树的边无向，建图要双向加边。',
      '有边权时把 d+1 换成 d+w。'
    ],
    walk: '链 1-2-3-4（3 条边）：直径 = 3。星型 1 连 2,3,4：直径 = 2。'
  },

  digit: {
    strategy:
      '数位统计：求 1 到 n 中数字 1 出现的次数。用「按位统计」：对每一位（个位、十位、百位…），把数字拆成高位 high、当前位 cur、低位 low，根据 cur 与 1 的关系分别累加 count = high*base + (cur>1?base:cur==1?low+1:0)。' +
      '这是数位 DP 的入门题，避免暴力枚举（n 到 10^12 会超时）。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'long long count1(long long n){\n' +
      '  long long ans = 0, base = 1;\n' +
      '  while (n / base){\n' +
      '    long long high = n / (base * 10), cur = (n / base) % 10, low = n % base;\n' +
      '    if (cur < 1) ans += high * base;\n' +
      '    else if (cur == 1) ans += high * base + low + 1;\n' +
      '    else ans += (high + 1) * base;\n' +
      '    base *= 10;\n' +
      '  }\n' +
      '  return ans;\n' +
      '}\n' +
      'int main(){ long long n; cin >> n; cout << count1(n) << "\\n"; return 0; }',
    complexity: 'O(log10 n) 按位统计，空间 O(1)。',
    pitfalls: [
      '必须分 cur<1、=1、>1 三种情况，cur==1 时要加上 low+1。',
      'n 很大（10^12）必须用 long long。',
      '统计的是数字 1 出现的总次数，不是含 1 的数的个数。'
    ],
    walk: 'n=13：写出 12345678910111213，数字 1 共出现 6 次。'
  },

  inverse: {
    strategy:
      '逆序对：序列中 i<j 且 a[i]>a[j] 的对数。归并排序过程中统计：合并左右两个有序段时，若左段元素 > 右段当前元素，则左段剩余所有元素都与之构成逆序对，一次性加 (mid-i+1)。' +
      '时间 O(n log n)，O(n²) 暴力在 n=5×10⁴ 时会超时。也可用树状数组（离散化后倒序查询）。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'long long a[100005], t[100005], ans = 0;\n' +
      'void merge(long long l, long long r){\n' +
      '  if (l >= r) return;\n' +
      '  long long m = (l + r) / 2; merge(l, m); merge(m + 1, r);\n' +
      '  long long i = l, j = m + 1, k = l;\n' +
      '  while (i <= m && j <= r){\n' +
      '    if (a[i] <= a[j]) t[k++] = a[i++];\n' +
      '    else { t[k++] = a[j++]; ans += m - i + 1; }\n' +
      '  }\n' +
      '  while (i <= m) t[k++] = a[i++];\n' +
      '  while (j <= r) t[k++] = a[j++];\n' +
      '  for (long long p = l; p <= r; p++) a[p] = t[p];\n' +
      '}\n' +
      'int main(){ int n; cin >> n; for (int i=1;i<=n;i++) cin >> a[i]; merge(1, n); cout << ans << "\\n"; return 0; }',
    complexity: '归并排序 O(n log n)，空间 O(n) 辅助数组；ans 用 long long（最大 n(n-1)/2）。',
    pitfalls: [
      'ans 累加的是 m - i + 1（左段剩余全部），不是 +1。',
      '逆序对总数可能超 int，ans 必须 long long。',
      '数组下标从 1 开始，递归边界 l>=r 返回。'
    ],
    walk: '序列 3 1 2：3>1、3>2 构成 2 个逆序对，输出 2。'
  },

  lis: {
    strategy:
      '最长上升子序列（LIS）。O(n²) DP 在 n=10⁵ 会超时，需用 O(n log n)：维护一个 tails 数组存「长度为 k 的上升子序列的最小结尾」。遍历每个数，用二分找到它在 tails 中的插入位置（第一个 ≥ 它的位置）替换它，找不到则追加。tails 的长度即 LIS 长度。' +
      '这就是「贪心 + 二分」经典写法，本质是维护最紧的结尾。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'int a[100005], tails[100005];\n' +
      'int lower(int len, int x){\n' +
      '  int lo = 1, hi = len, res = len + 1;\n' +
      '  while (lo <= hi){ int mid = (lo + hi) / 2; if (tails[mid] >= x){ res = mid; hi = mid - 1; } else lo = mid + 1; }\n' +
      '  return res;\n' +
      '}\n' +
      'int main(){\n' +
      '  int n; cin >> n; for (int i=1;i<=n;i++) cin >> a[i];\n' +
      '  int len = 0;\n' +
      '  for (int i=1;i<=n;i++){ int p = lower(len, a[i]); tails[p] = a[i]; if (p > len) len = p; }\n' +
      '  cout << len << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: '每个元素一次二分 O(log n)，总 O(n log n)，空间 O(n)。',
    pitfalls: [
      '二分找的是「第一个 ≥ x 的位置」（lower_bound），不是 > x。',
      'tails 数组存的是各长度的最小结尾，不是真正的 LIS 序列。',
      '严格上升用 ≥；若「非降」则把判断改成 >。'
    ],
    walk: '序列 2 1 5 3 6 4 8 9：LIS = 1,3,4,8,9 长度 5。'
  },

  pack: {
    strategy:
      '01 背包：n 件物品，每件体积 v、价值 w，背包容量 V，求最大总价值。状态 dp[j] = 容量为 j 时的最大价值，倒序枚举容量：dp[j] = max(dp[j], dp[j-v] + w)。' +
      '倒序是为了保证每件物品只取一次。初始化 dp[0]=0，其余 -inf（或求最大价值时默认 0），注意容量 j 从 V 递减到 v。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'long long dp[10005];\n' +
      'int main(){\n' +
      '  int n, V; cin >> n >> V;\n' +
      '  for (int i=0;i<n;i++){ int v, w; cin >> v >> w; for (int j=V;j>=v;j--) if (dp[j-v]+w > dp[j]) dp[j] = dp[j-v]+w; }\n' +
      '  cout << dp[V] << "\\n";\n' +
      '  return 0;\n' +
      '}',
    complexity: 'O(n·V) 时间，O(V) 一维空间（滚动数组优化）。',
    pitfalls: [
      '容量必须倒序枚举，正序会变成完全背包（同一物品取多次）。',
      'dp 数组要初始化为 0（求最大价值且每件可不选）。',
      '价值累加可能超 int，用 long long。'
    ],
    walk: '容量 4：物品(2,3)、(3,4)、(1,2)。最优取 (2,3)+(1,2)=5 或 (3,4)=4，答案 5。'
  },

  dijkstra: {
    strategy:
      '单源最短路（边权非负），Dijkstra。用 dist[] 记录起点到各点的最短距离，每次从「未确定」的点里选 dist 最小的，用它的出边松弛邻居。' +
      'O(n²) 朴素写法适合 n≤1000：直接扫一遍找最小 dist；n 更大或稀疏图要用优先队列（堆）降到 O((n+m)log n)。注意重边和自环。',
    code:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      'const int INF = 1e9;\n' +
      'int d[1005][1005], dist[1005], vis[1005];\n' +
      'int main(){\n' +
      '  int n, m, s; cin >> n >> m >> s;\n' +
      '  for (int i=1;i<=n;i++) for (int j=1;j<=n;j++) d[i][j] = INF;\n' +
      '  for (int i=0;i<m;i++){ int u,v,w; cin >> u >> v >> w; if (w < d[u][v]) d[u][v] = w; }\n' +
      '  for (int i=1;i<=n;i++) dist[i] = INF; dist[s] = 0;\n' +
      '  for (int t=1;t<=n;t++){\n' +
      '    int u = 0; for (int i=1;i<=n;i++) if (!vis[i] && (u==0 || dist[i] < dist[u])) u = i;\n' +
      '    vis[u] = 1;\n' +
      '    for (int v=1;v<=n;v++) if (dist[u]+d[u][v] < dist[v]) dist[v] = dist[u]+d[u][v];\n' +
      '  }\n' +
      '  for (int i=1;i<=n;i++) cout << (dist[i]==INF?-1:dist[i]) << " \\n"[i==n];\n' +
      '  return 0;\n' +
      '}',
    complexity: '朴素 O(n²) 选点 + O(n) 松弛，总 O(n²)；优先队列版 O((n+m)log n)。',
    pitfalls: [
      '边权必须非负，负权要用 SPFA/Bellman-Ford。',
      '重边要取最小权，自环忽略；距离初值设 INF。',
      '不可达输出 -1 而不是 INF。'
    ],
    walk: '3 点：1→2 权 2，1→3 权 5，2→3 权 1。起点 1 到 3 最短路 = 2+1=3，而非直连 5。'
  }
};
