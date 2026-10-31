/* 复习端 · 模板速查板块 —— 22 个高频算法模板 + 考前自检清单
 * 数据来源：apple-pc/csp-template（已并入，原仓库删除）
 * 结构：window.REVIEW_SECTIONS.template = { title, icon, intro, nodes[] }
 * 每个 node 的 blocks 支持 h / html / code / list(+ordered) / note{type,title,text} / table，
 * 由 review.js 的 renderBlocks 统一渲染，因此自动获得目录、搜索、进度与分组折叠。
 * 注意：nodes 必须按 group 连续排列，否则左栏会把同一分组拆成多个标题。
 */
window.REVIEW_SECTIONS.template = {
 "title": "模板速查",
 "icon": "⚡",
 "intro": "这一板块是考场用的模板卡：22 个高频算法的最短可提交写法，每条都标了标签（必须 / 高频 / 基础 / 常用 / 较难）、用途与复杂度，底下列出最容易写错的地方。和算法教学不同，这里不讲推导，只给能直接抄上去跑的东西——赛前过一遍，考场上照着改文件名就行。",
 "nodes": [
  {
   "id": "tg-check",
   "title": "考前 10 分钟自检",
   "meta": "临场 · 必看",
   "group": "开始之前",
   "blocks": [
    {
     "note": {
      "type": "warn",
      "title": "最后 10 分钟只检查这些",
      "text": "下面五条按顺序过一遍。它们不涉及算法，但每一条都对应过真实的爆零案例。"
     }
    },
    {
     "ordered": true,
     "list": [
      "文件名、<code>freopen</code> 的 <code>.in</code>/<code>.out</code> 拼写与大小写",
      "数组大小是否多开，该开的 <code>long long</code> 开没开",
      "多测有没有清空数组、队列、<code>ans</code>",
      "本地编译一遍，样例过不过",
      "不会的题有没有写暴力，别空着"
     ]
    },
    {
     "h": "为什么是这五条",
     "html": "复赛的失分大部分不是「不会」，而是「会但没拿到」。文件读写写错、<code>long long</code> 溢出、多测没清空——这三类错误占总爆零原因的绝大多数，而且都属于检查一遍就能发现的问题。所以最后十分钟不要再用来看题，用来检查。"
    }
   ]
  },
  {
   "id": "tg-io",
   "title": "文件 IO",
   "meta": "必须 · O(1)",
   "group": "基础与 IO",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>读写文件，CSP 必须　·　<b>复杂度：</b>O(1)"
    },
    {
     "h": "模板",
     "code": "#include <cstdio>\nint main() {\n    freopen(\"problem.in\", \"r\", stdin);\n    freopen(\"problem.out\", \"w\", stdout);\n    // 你的代码\n    fclose(stdin); fclose(stdout);\n    return 0;\n}"
    },
    {
     "h": "易错点",
     "list": [
      "文件名照抄题目，注意大小写和 .in/.out 后缀",
      "忘写 freopen 或文件名写错 = 爆零，检查两遍",
      "不写 fclose 也行，return 0 时会自动刷新缓冲区"
     ]
    }
   ]
  },
  {
   "id": "tg-fastio",
   "title": "快读",
   "meta": "可选 · O(1)",
   "group": "基础与 IO",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>大量输入时加速　·　<b>复杂度：</b>O(1)"
    },
    {
     "h": "模板",
     "code": "inline int read() {\n    int x = 0, f = 1; char c = getchar();\n    while (c < '0' || c > '9') { if (c == '-') f = -1; c = getchar(); }\n    while (c >= '0' && c <= '9') { x = x * 10 + c - '0'; c = getchar(); }\n    return x * f;\n}"
    },
    {
     "h": "易错点",
     "list": [
      "用了快读就别再关同步的 cin 混用",
      "输入有负数时别忘判负号",
      "数据量不大就别折腾，scanf 够用"
     ]
    }
   ]
  },
  {
   "id": "tg-binary",
   "title": "二分",
   "meta": "高频 · O(log n)",
   "group": "基础与 IO",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>查找、二分答案　·　<b>复杂度：</b>O(log n)"
    },
    {
     "h": "模板",
     "code": "// 找第一个 >= x 的位置\nint l = 1, r = n, ans = n + 1;\nwhile (l <= r) {\n    int mid = l + (r - l) / 2;\n    if (a[mid] >= x) ans = mid, r = mid - 1;\n    else l = mid + 1;\n}\n\n// 二分答案：最大化可行值\nint l = 0, r = 1e9;\nwhile (l < r) {\n    int mid = l + (r - l + 1) / 2;  // 上取整，防死循环\n    if (check(mid)) l = mid;\n    else r = mid - 1;\n}"
    },
    {
     "h": "易错点",
     "list": [
      "最大化用上取整 mid，最小化用下取整 mid",
      "check 单调性是前提，先想清楚再写",
      "边界 l 和 r 的初始值要覆盖答案范围"
     ]
    }
   ]
  },
  {
   "id": "tg-prefix",
   "title": "前缀和 / 差分",
   "meta": "高频 · O(n) 预处理",
   "group": "基础与 IO",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>区间和、区间加　·　<b>复杂度：</b>O(n) 预处理"
    },
    {
     "h": "模板",
     "code": "// 一维前缀和\nfor (int i = 1; i <= n; i++) s[i] = s[i - 1] + a[i];\n// 区间和 [l, r]\nlong long sum = s[r] - s[l - 1];\n\n// 一维差分：区间 [l, r] 加 v\nd[l] += v; d[r + 1] -= v;\nfor (int i = 1; i <= n; i++) d[i] += d[i - 1];  // 还原"
    },
    {
     "h": "易错点",
     "list": [
      "下标从 1 开始，s[0] = 0",
      "差分数组长度开到 n + 2",
      "二维前缀和别忘容斥：+ - - +"
     ]
    }
   ]
  },
  {
   "id": "tg-qpow",
   "title": "快速幂",
   "meta": "基础 · O(log b)",
   "group": "基础与 IO",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>取模幂运算　·　<b>复杂度：</b>O(log b)"
    },
    {
     "h": "模板",
     "code": "long long qpow(long long a, long long b, long long p) {\n    long long res = 1 % p;\n    a %= p;\n    while (b) {\n        if (b & 1) res = res * a % p;\n        a = a * a % p;\n        b >>= 1;\n    }\n    return res;\n}"
    },
    {
     "h": "易错点",
     "list": [
      "底数先取模，防止溢出",
      "p = 1 时答案是 0，所以写 1 % p",
      "乘法可能溢出就改用 __int128"
     ]
    }
   ]
  },
  {
   "id": "tg-dsu",
   "title": "并查集",
   "meta": "高频 · 近 O(1)",
   "group": "数据结构",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>连通性、合并集合、Kruskal　·　<b>复杂度：</b>近 O(1)"
    },
    {
     "h": "模板",
     "code": "int fa[N];\nvoid init(int n) { for (int i = 1; i <= n; i++) fa[i] = i; }\nint find(int x) { return fa[x] == x ? x : fa[x] = find(fa[x]); }\nvoid merge(int x, int y) { fa[find(x)] = find(y); }\n// 判连通：find(x) == find(y)"
    },
    {
     "h": "易错点",
     "list": [
      "路径压缩写在 find 里，别忘赋值 fa[x]",
      "合并前先 find，别直接改 fa",
      "需要维护集合大小时加一个 siz 数组"
     ]
    }
   ]
  },
  {
   "id": "tg-bit",
   "title": "树状数组",
   "meta": "常用 · O(log n)",
   "group": "数据结构",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>单点修改、区间查询　·　<b>复杂度：</b>O(log n)"
    },
    {
     "h": "模板",
     "code": "int lowbit(int x) { return x & -x; }\nvoid add(int i, int v) { for (; i <= n; i += lowbit(i)) t[i] += v; }\nint sum(int i) { int s = 0; for (; i > 0; i -= lowbit(i)) s += t[i]; return s; }\n// 区间 [l, r]：sum(r) - sum(l - 1)"
    },
    {
     "h": "易错点",
     "list": [
      "下标从 1 开始，0 不能用",
      "区间修改要用差分树状数组",
      "多测清空 t 数组"
     ]
    }
   ]
  },
  {
   "id": "tg-seg",
   "title": "线段树",
   "meta": "较难 · O(log n)",
   "group": "数据结构",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>区间修改、区间查询　·　<b>复杂度：</b>O(log n)"
    },
    {
     "h": "模板",
     "code": "void build(int p, int l, int r) {\n    if (l == r) { t[p] = a[l]; return; }\n    int mid = (l + r) >> 1;\n    build(p << 1, l, mid); build(p << 1 | 1, mid + 1, r);\n    t[p] = t[p << 1] + t[p << 1 | 1];\n}\nvoid pushdown(int p, int l, int r) {\n    if (!tag[p]) return;\n    int mid = (l + r) >> 1;\n    t[p << 1] += tag[p] * (mid - l + 1); tag[p << 1] += tag[p];\n    t[p << 1 | 1] += tag[p] * (r - mid); tag[p << 1 | 1] += tag[p];\n    tag[p] = 0;\n}"
    },
    {
     "h": "易错点",
     "list": [
      "数组开 4 倍",
      "修改和查询前都要 pushdown",
      "不熟就别现场手推，写暴力更稳"
     ]
    }
   ]
  },
  {
   "id": "tg-st",
   "title": "ST 表",
   "meta": "常用 · O(n log n) 预处理，O(1) 查询",
   "group": "数据结构",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>静态区间最值　·　<b>复杂度：</b>O(n log n) 预处理，O(1) 查询"
    },
    {
     "h": "模板",
     "code": "int st[N][20], lg[N];\nfor (int i = 2; i <= n; i++) lg[i] = lg[i >> 1] + 1;\nfor (int i = 1; i <= n; i++) st[i][0] = a[i];\nfor (int j = 1; (1 << j) <= n; j++)\n    for (int i = 1; i + (1 << j) - 1 <= n; i++)\n        st[i][j] = max(st[i][j - 1], st[i + (1 << (j - 1))][j - 1]);\n\n// 查询 [l, r]\nint k = lg[r - l + 1];\nint ans = max(st[l][k], st[r - (1 << k) + 1][k]);"
    },
    {
     "h": "易错点",
     "list": [
      "只能处理静态数据，带修改就别用",
      "第二维开到 log2(n) + 1",
      "查询时两个区间可以重叠"
     ]
    }
   ]
  },
  {
   "id": "tg-mono",
   "title": "单调栈",
   "meta": "常用 · O(n)",
   "group": "数据结构",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>下一个更大 / 更小元素　·　<b>复杂度：</b>O(n)"
    },
    {
     "h": "模板",
     "code": "// 求每个数右边第一个更大的数的下标\nstack<int> st;\nfor (int i = n; i >= 1; i--) {\n    while (!st.empty() && a[st.top()] <= a[i]) st.pop();\n    nxt[i] = st.empty() ? 0 : st.top();\n    st.push(i);\n}"
    },
    {
     "h": "易错点",
     "list": [
      "栈里存下标，方便取值和算距离",
      "求更小就把比较符号反过来",
      "单调队列用于滑动窗口最值"
     ]
    }
   ]
  },
  {
   "id": "tg-bfs",
   "title": "BFS",
   "meta": "高频 · O(n + m)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>最短路（边权为 1）、层序　·　<b>复杂度：</b>O(n + m)"
    },
    {
     "h": "模板",
     "code": "int dx[4] = {0, 0, 1, -1}, dy[4] = {1, -1, 0, 0};\nqueue<pair<int,int>> q;\nq.push({sx, sy}); vis[sx][sy] = 1; dis[sx][sy] = 0;\nwhile (!q.empty()) {\n    auto [x, y] = q.front(); q.pop();\n    for (int k = 0; k < 4; k++) {\n        int nx = x + dx[k], ny = y + dy[k];\n        if (nx < 1 || nx > n || ny < 1 || ny > m) continue;\n        if (vis[nx][ny]) continue;\n        vis[nx][ny] = 1;\n        dis[nx][ny] = dis[x][y] + 1;\n        q.push({nx, ny});\n    }\n}"
    },
    {
     "h": "易错点",
     "list": [
      "入队时就标记 vis，别等出队",
      "多测记得清空 vis 和队列",
      "边权为 1 才能用 BFS 求最短路"
     ]
    }
   ]
  },
  {
   "id": "tg-dfs",
   "title": "DFS",
   "meta": "基础 · O(n + m)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>遍历、搜索、回溯　·　<b>复杂度：</b>O(n + m)"
    },
    {
     "h": "模板",
     "code": "void dfs(int u) {\n    vis[u] = 1;\n    for (int v : g[u]) {\n        if (!vis[v]) dfs(v);\n    }\n}"
    },
    {
     "h": "易错点",
     "list": [
      "递归深度大时改迭代或手动开栈",
      "回溯题记得恢复现场",
      "多测清空 vis"
     ]
    }
   ]
  },
  {
   "id": "tg-dij",
   "title": "Dijkstra",
   "meta": "高频 · O(m log n)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>非负边权最短路　·　<b>复杂度：</b>O(m log n)"
    },
    {
     "h": "模板",
     "code": "priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;\nfill(dis + 1, dis + n + 1, INF);\ndis[s] = 0; pq.push({0, s});\nwhile (!pq.empty()) {\n    auto [d, u] = pq.top(); pq.pop();\n    if (d > dis[u]) continue;          // 懒惰删除\n    for (auto [v, w] : g[u]) {\n        if (dis[v] > d + w) {\n            dis[v] = d + w;\n            pq.push({dis[v], v});\n        }\n    }\n}"
    },
    {
     "h": "易错点",
     "list": [
      "只适用于非负边权，有负边用 SPFA 或 Bellman-Ford",
      "dis 初始化为一个大数，别用 memset 设 1e9",
      "重边不用特殊处理，取小即可"
     ]
    }
   ]
  },
  {
   "id": "tg-topo",
   "title": "拓扑排序",
   "meta": "高频 · O(n + m)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>DAG 顺序、判环　·　<b>复杂度：</b>O(n + m)"
    },
    {
     "h": "模板",
     "code": "queue<int> q;\nfor (int i = 1; i <= n; i++) if (deg[i] == 0) q.push(i);\nwhile (!q.empty()) {\n    int u = q.front(); q.pop();\n    ans.push_back(u);\n    for (int v : g[u]) {\n        if (--deg[v] == 0) q.push(v);\n    }\n}\n// ans.size() < n 说明有环"
    },
    {
     "h": "易错点",
     "list": [
      "deg 是入度，建图时统计",
      "判环看最后入队数量是否等于 n",
      "多测清空 deg 和 ans"
     ]
    }
   ]
  },
  {
   "id": "tg-floyd",
   "title": "Floyd",
   "meta": "基础 · O(n^3)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>多源最短路、传递闭包　·　<b>复杂度：</b>O(n^3)"
    },
    {
     "h": "模板",
     "code": "for (int k = 1; k <= n; k++)\n    for (int i = 1; i <= n; i++)\n        for (int j = 1; j <= n; j++)\n            d[i][j] = min(d[i][j], d[i][k] + d[k][j]);"
    },
    {
     "h": "易错点",
     "list": [
      "k 必须在最外层，别写错顺序",
      "n 超过 500 就别用",
      "初始化：自己到自己是 0，其他是 INF"
     ]
    }
   ]
  },
  {
   "id": "tg-kruskal",
   "title": "Kruskal 最小生成树",
   "meta": "常用 · O(m log m)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>最小生成树　·　<b>复杂度：</b>O(m log m)"
    },
    {
     "h": "模板",
     "code": "sort(e + 1, e + m + 1, [](Edge a, Edge b) { return a.w < b.w; });\ninit(n);\nint cnt = 0; long long ans = 0;\nfor (int i = 1; i <= m; i++) {\n    int x = find(e[i].u), y = find(e[i].v);\n    if (x == y) continue;\n    fa[x] = y; ans += e[i].w;\n    if (++cnt == n - 1) break;\n}\n// cnt < n - 1 说明图不连通"
    },
    {
     "h": "易错点",
     "list": [
      "先按边权排序，再用并查集判环",
      "边权和大时 ans 开 long long",
      "别忘了判断不连通的情况"
     ]
    }
   ]
  },
  {
   "id": "tg-tarjan",
   "title": "Tarjan 求强连通分量",
   "meta": "较难 · O(n + m)",
   "group": "图论",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>SCC、缩点　·　<b>复杂度：</b>O(n + m)"
    },
    {
     "h": "模板",
     "code": "int dfn[N], low[N], scc[N], timer, cnt;\nstack<int> st; bool inSt[N];\nvoid tarjan(int u) {\n    dfn[u] = low[u] = ++timer;\n    st.push(u); inSt[u] = true;\n    for (int v : g[u]) {\n        if (!dfn[v]) {\n            tarjan(v);\n            low[u] = min(low[u], low[v]);\n        } else if (inSt[v]) {\n            low[u] = min(low[u], dfn[v]);\n        }\n    }\n    if (dfn[u] == low[u]) {\n        cnt++;\n        while (true) {\n            int v = st.top(); st.pop();\n            inSt[v] = false; scc[v] = cnt;\n            if (v == u) break;\n        }\n    }\n}"
    },
    {
     "h": "易错点",
     "list": [
      "dfn == low 时弹栈，弹出来的就是一个 SCC",
      "缩点后图变成 DAG，可以拓扑排序 + DP",
      "多测清空 dfn、low、inSt、栈"
     ]
    }
   ]
  },
  {
   "id": "tg-knapsack",
   "title": "01 背包 / 完全背包",
   "meta": "高频 · O(nm)",
   "group": "动态规划",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>选或不选、无限选　·　<b>复杂度：</b>O(nm)"
    },
    {
     "h": "模板",
     "code": "// f[j] 表示容量不超过 j 的最大价值\nfor (int i = 1; i <= n; i++)\n    for (int j = m; j >= w[i]; j--)        // 01 背包：倒序\n        f[j] = max(f[j], f[j - w[i]] + v[i]);\n\n// 完全背包：正序\n// for (int j = w[i]; j <= m; j++)\n//     f[j] = max(f[j], f[j - w[i]] + v[i]);"
    },
    {
     "h": "易错点",
     "list": [
      "01 背包倒序，完全背包正序，别写反",
      "要求\"恰好装满\"时，f 初值除 f[0] 外设为负无穷",
      "价值大时可能要开 long long"
     ]
    }
   ]
  },
  {
   "id": "tg-intervaldp",
   "title": "区间 DP",
   "meta": "较难 · O(n^3)",
   "group": "动态规划",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>合并类问题（石子合并）　·　<b>复杂度：</b>O(n^3)"
    },
    {
     "h": "模板",
     "code": "for (int i = 1; i <= n; i++) s[i] = s[i - 1] + a[i];\nfor (int len = 2; len <= n; len++)\n    for (int i = 1; i + len - 1 <= n; i++) {\n        int j = i + len - 1;\n        f[i][j] = INF;\n        for (int k = i; k < j; k++)\n            f[i][j] = min(f[i][j], f[i][k] + f[k + 1][j] + s[j] - s[i - 1]);\n    }"
    },
    {
     "h": "易错点",
     "list": [
      "先枚举区间长度，再枚举起点",
      "环形问题可以复制一份数组变链",
      "f 数组初值别忘设 INF"
     ]
    }
   ]
  },
  {
   "id": "tg-treedp",
   "title": "树形 DP",
   "meta": "常用 · O(n)",
   "group": "动态规划",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>树上选 / 不选（没有上司的舞会）　·　<b>复杂度：</b>O(n)"
    },
    {
     "h": "模板",
     "code": "void dfs(int u, int fa) {\n    f[u][1] = w[u]; f[u][0] = 0;\n    for (int v : g[u]) {\n        if (v == fa) continue;\n        dfs(v, u);\n        f[u][0] += max(f[v][0], f[v][1]);\n        f[u][1] += f[v][0];\n    }\n}"
    },
    {
     "h": "易错点",
     "list": [
      "先递归儿子，再合并答案",
      "注意无向边要判父亲，别走回去",
      "多测清空 f 和邻接表"
     ]
    }
   ]
  },
  {
   "id": "tg-hash",
   "title": "字符串哈希",
   "meta": "常用 · O(n) 预处理",
   "group": "字符串",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>判断子串是否相等　·　<b>复杂度：</b>O(n) 预处理"
    },
    {
     "h": "模板",
     "code": "const int P = 131;\nunsigned long long h[N], pw[N];\npw[0] = 1;\nfor (int i = 1; i <= n; i++) {\n    pw[i] = pw[i - 1] * P;\n    h[i] = h[i - 1] * P + s[i];\n}\n// 子串 [l, r] 的哈希\nunsigned long long get(int l, int r) {\n    return h[r] - h[l - 1] * pw[r - l + 1];\n}"
    },
    {
     "h": "易错点",
     "list": [
      "自然溢出写法简单，但有被卡的风险",
      "重要场合用双模数更稳",
      "字符串下标从 1 开始"
     ]
    }
   ]
  },
  {
   "id": "tg-kmp",
   "title": "KMP",
   "meta": "较难 · O(n + m)",
   "group": "字符串",
   "blocks": [
    {
     "h": "用途与复杂度",
     "html": "<b>用途：</b>字符串匹配　·　<b>复杂度：</b>O(n + m)"
    },
    {
     "h": "模板",
     "code": "int nxt[N];\nvoid getnext(const string &p) {\n    int m = p.size(); nxt[0] = -1;\n    for (int i = 1, j = -1; i < m; i++) {\n        while (j >= 0 && p[i] != p[j + 1]) j = nxt[j];\n        if (p[i] == p[j + 1]) j++;\n        nxt[i] = j;\n    }\n}"
    },
    {
     "h": "易错点",
     "list": [
      "nxt 数组的含义是\"最长相等前后缀\"",
      "不熟就写暴力匹配，别现场调 KMP",
      "匹配时失配要跳 nxt，不是重新开始"
     ]
    }
   ]
  }
 ]
};
