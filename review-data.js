/* 复习端 · 通用板块数据（方法与技巧 / 算法教学 / 考前注意事项 / IDE 指南）—— 随仓库发布，运行时由 review.js 读取 */
window.REVIEW_SECTIONS = {
  "methods": {
    "title": "方法与技巧",
    "icon": "🛠️",
    "intro": "这一板块讲的不是某个具体算法，而是「怎么把题做出来、怎么不做错」的通用方法：复杂度怎么估、暴力怎么变正解、代码怎么调、考场上时间怎么分。很多人刷了几百题还是上不了分，缺的往往就是这一层。左边是 8 个主题，每个都配了可直接套用的模板。",
    "nodes": [
      {
        "id": "m1",
        "title": "输入输出与快读",
        "meta": "基础 · 性能",
        "blocks": [
          {
            "h": "什么时候需要考虑 IO 速度",
            "html": "读入数据量小于 10⁵ 时，随便用什么方式都感觉不到差别。但当 n 到 10⁶ 级，<code>cin</code> 默认配置每秒只能处理约 10⁶ 个数，很容易成为瓶颈——算法是 O(n log n) 却因为读入慢而 TLE，这是最冤的一种超时。判断标准很简单：<b>输入规模超过 10⁶ 个数，就必须加速</b>。"
          },
          {
            "h": "方案一：cin/cout 加速（首选）",
            "html": "两行代码，加在 main 开头，几乎没有副作用，能解决 95% 的 IO 慢问题。原理是关掉 C 与 C++ 两套流的同步、以及 cin 与 cout 的自动绑定。<b>注意</b>：加了之后就不要再用 scanf/printf，混用会导致输出顺序错乱。"
          },
          {
            "h": "加速模板",
            "code": "int main(){\n    ios::sync_with_stdio(false);\n    cin.tie(0);\n    cout.tie(0);\n    // 之后正常使用 cin / cout 即可\n}"
          },
          {
            "h": "方案二：scanf / printf",
            "html": "C 风格 IO 本身就比未加速的 cin 快。格式符必须和类型严格对应：<code>%d</code> 对应 int，<code>%lld</code> 对应 long long，<code>%lf</code> 读 double、<code>%f</code> 输出 double，<code>%c</code> 字符，<code>%s</code> 字符串。<br>最常见的隐蔽 bug：用 <code>%d</code> 输出 long long，结果变成一个莫名其妙的小数字，而且编译不报错。"
          },
          {
            "h": "scanf / printf 用法",
            "code": "int a; long long b; double c;\nscanf(\"%d %lld %lf\", &a, &b, &c);\nprintf(\"%d %lld %.2f\\n\", a, b, c);"
          },
          {
            "h": "方案三：fread 快读（极限情况）",
            "html": "当输入达到 10⁷ 个数级别，连 scanf 都嫌慢时，才需要手写基于 <code>fread</code> 的读入。原理是一次性把整个文件读进缓冲区，再自己逐字符解析数字。<b>建议</b>：平时比赛用方案一就够了，把快读当备用技能，别为了炫技引入 bug。"
          },
          {
            "h": "fread 快读模板",
            "code": "char buf[1 << 20];   // 1MB 缓冲\nint pos = 0, len = 0;\n\ninline char gc(){\n    if (pos == len){ len = fread(buf, 1, sizeof(buf), stdin); pos = 0; }\n    return pos < len ? buf[pos++] : EOF;\n}\ninline int readInt(){\n    int x = 0; char c = gc();\n    while (c < '0' || c > '9') c = gc();\n    while (c >= '0' && c <= '9'){ x = x * 10 + (c - '0'); c = gc(); }\n    return x;\n}"
          },
          {
            "h": "输出也要快",
            "html": "cout 每个 <code>&lt;&lt;</code> 都可能触发一次刷新。<code>\"\\n\"</code> 比 <code>endl</code> 快很多——因为 <code>endl</code> 每次都会强制刷新缓冲区。<b>竞赛代码里永远不要用 endl</b>，这是最省事的一条优化。"
          }
        ]
      },
      {
        "id": "m2",
        "title": "复杂度估算",
        "meta": "基础 · 判断会不会超时",
        "blocks": [
          {
            "h": "时间复杂度的意义",
            "html": "时间复杂度描述「操作次数随数据规模增长的趋势」。它不看具体常数，只看量级——因为常数受编译器、机器影响，而量级决定了算法能不能扛住规模。CSP-S 的时限通常是 1 秒，现代评测机每秒约能执行 <b>10⁸</b> 次简单操作。"
          },
          {
            "h": "数据范围反推复杂度（最重要的一张表）",
            "list": [
              "n ≤ 10：O(n!) 或 O(2ⁿ) 的暴力枚举都可以",
              "n ≤ 20：O(2ⁿ) 状压 DP、暴力搜索",
              "n ≤ 100：O(n³) 三重循环、Floyd",
              "n ≤ 1000：O(n²) 双重循环、普通 DP",
              "n ≤ 10⁵：O(n log n) 排序、二分、树状数组",
              "n ≤ 10⁶：O(n) 线性扫描、前缀和",
              "n ≤ 10⁹ ~ 10¹⁸：O(log n) 或 O(1)，通常是数学/二分"
            ]
          },
          {
            "h": "怎么用这张表",
            "html": "看到题先看数据范围，<b>范围直接告诉你该用什么复杂度的算法</b>。比如 n ≤ 10⁵ 而你想到 O(n²)，那就是 10¹⁰ 次操作，必然超时，必须优化到 O(n log n)。反过来，n ≤ 100 时你写了个 O(n³)，虽然慢但完全没问题——不要过度优化。这是老手和新手最明显的差别：老手先算账，新手先写代码。"
          },
          {
            "h": "空间复杂度",
            "html": "常用换算：<code>int</code> 4 字节，<code>long long</code> 8 字节，1MB ≈ 26 万个 int。题目一般给 128MB 或 256MB，即约 3000 万 ~ 6000 万个 int。<br><b>典型错误</b>：开 <code>int a[10000][10000]</code>，等于 4×10⁸ 字节 = 400MB，直接 MLE。"
          },
          {
            "h": "常见算法复杂度速查",
            "list": [
              "冒泡/选择/插入排序：O(n²)",
              "sort / 归并 / 快排：O(n log n)",
              "二分查找、二分答案：O(log n) / O(n log n)",
              "前缀和查询：预处理 O(n)，单次 O(1)",
              "朴素递归斐波那契：O(2ⁿ)；记忆化后 O(n)",
              "01 背包：O(nW)（n 物品数，W 容量）",
              "Dijkstra（堆优化）：O(m log n)"
            ]
          },
          {
            "h": "常数因子也会咬人",
            "html": "同样是 O(n log n)，<code>sort</code> 的实际速度可能比手写归并快 3 倍，因为 STL 做了大量优化。当复杂度刚好卡在边界（比如算出 2×10⁸ 次操作），优化常数（少取模、少调用函数、把循环里不变的量提到外面）就可能救命。"
          },
          {
            "h": "循环内外提优化",
            "code": "// 慢：每次循环都算一次 strlen（O(n)），总复杂度 O(n^2)\nfor (int i = 0; i < strlen(s); i++) { }\n\n// 快：长度只算一次，总复杂度 O(n)\nint len = strlen(s);\nfor (int i = 0; i < len; i++) { }"
          }
        ]
      },
      {
        "id": "m3",
        "title": "对拍与暴力验证",
        "meta": "调试 · 保证正确性",
        "blocks": [
          {
            "h": "对拍是什么",
            "html": "对拍 = 用一个「绝对正确但很慢」的暴力程序，去验证「快但可能错」的正解程序。做法是随机生成大量小数据，两个程序都跑，比对输出。一旦不一致，就说明正解有 bug，而且你拿到了一组能复现错误的数据。<b>这是竞赛里最有效的找错手段</b>，比盯着代码看强十倍。"
          },
          {
            "h": "对拍三步流程",
            "html": "① 写 <code>gen</code>（随机数据生成器，用 rand 造小规模数据）；② 写 <code>brute</code>（暴力，哪怕 O(n³) 也行，只要保证对）；③ 循环跑：gen 造数据 → 两个程序跑 → 用 diff 比对输出。规模要小（n ≤ 10），这样暴力跑得快，且容易暴露边界错误。"
          },
          {
            "h": "随机数据生成器",
            "code": "#include <cstdio>\n#include <cstdlib>\n#include <ctime>\n\nint main(){\n    srand(time(0));\n    int n = rand() % 8 + 1;        // 1 ~ 8\n    printf(\"%d\\n\", n);\n    for (int i = 0; i < n; i++)\n        printf(\"%d \", rand() % 20 - 10);   // -10 ~ 9，含负数\n    return 0;\n}"
          },
          {
            "h": "shell 批量对拍",
            "html": "在 NOI Linux 下用 shell 循环，几百次对拍几秒就完成。命令里的 <code>diff -w</code> 会忽略行尾空白差异，避免假报错。"
          },
          {
            "h": "对拍脚本",
            "code": "for i in $(seq 1 500); do\n    ./gen > in.txt\n    ./brute < in.txt > out1.txt\n    ./solve < in.txt > out2.txt\n    if ! diff -w out1.txt out2.txt > /dev/null; then\n        echo \"WA on case $i\"\n        cat in.txt\n        break\n    fi\ndone\necho \"done\""
          },
          {
            "h": "对拍要造什么数据",
            "html": "随机数据只能发现大部分错误，<b>边界和极端情况必须单独造</b>：n=1、全相同、全递增、全递减、全是负数、最大值刚好卡上限。很多 bug 只在「所有元素相等」或「只有一个元素」时暴露。"
          },
          {
            "h": "没有对拍环境怎么办",
            "html": "本模拟器的评测面板只给测试点结果，不给数据，所以对拍要自己在本地做。退而求其次的办法：<b>自己当暴力程序</b>——手算几组小数据，和程序输出比。重点是养成「写完先测边界」的习惯，而不是提交后等 WA。"
          }
        ]
      },
      {
        "id": "m4",
        "title": "二分答案套路",
        "meta": "套路 · 把最优化变成判定",
        "blocks": [
          {
            "h": "二分查找的本质",
            "html": "在<b>有序</b>序列里，每次取中点比较，排除一半，O(log n) 找到目标。10⁹ 的范围只需 30 次比较——这就是二分的威力：把线性搜索变成对数搜索。"
          },
          {
            "h": "二分答案：换个问法",
            "html": "很多最优化问题是「求最小/最大的 xx」，直接求很难，但「给定 xx，判断是否可行」很容易。这时就可以<b>二分 xx 的值</b>，用可行性判断作为收缩条件。这是 CSP-S 最高频的套路之一，几乎每年都有题目可以用。"
          },
          {
            "h": "二分答案的完整模板",
            "html": "关键是边界处理和「判断函数」的单调性。下面这个模板求「最小的满足 check 的 x」："
          },
          {
            "h": "二分答案模板",
            "code": "// 求最小的 x，使得 check(x) 为真；check 必须单调：真之后一直为真\nint l = 0, r = 1000000000, ans = -1;\nwhile (l <= r){\n    int mid = l + (r - l) / 2;    // 防溢出写法\n    if (check(mid)){ ans = mid; r = mid - 1; }  // 可行，试着更小\n    else l = mid + 1;                            // 不可行，必须更大\n}\ncout << ans;"
          },
          {
            "h": "单调性是前提",
            "html": "二分答案能用的<b>唯一条件</b>是：判断结果随 x 单调变化。比如「每段和不超过 x 时最少分几段」——x 越大，需要分的段越少，这是单调的，可以二分。如果判断结果忽真忽假（比如「恰好等于 x」），就不能二分。"
          },
          {
            "h": "经典题型识别",
            "list": [
              "「最大值最小」/「最小值最大」→ 几乎一定是二分答案",
              "「最少需要多少时间/多少钱/多少容量」→ 二分 + 贪心 check",
              "「能否在 k 次操作内完成」→ 二分操作次数",
              "check 内部常用贪心或前缀和，复杂度 O(n)，总 O(n log V)"
            ]
          },
          {
            "h": "一个完整例子：分割数组",
            "html": "<b>题</b>：把 n 个数分成连续的 k 段，让「最大段和」尽可能小。<br><b>思路</b>：二分答案 x = 最大段和上限，check(x) 用贪心：从左往右累加，超过 x 就切一段。若段数 ≤ k 则可行。复杂度 O(n log(总和))。"
          },
          {
            "h": "分割数组 check 函数",
            "code": "int a[100005], n, k;\n\nbool check(long long x){      // 每段和不超过 x，能否分成 <= k 段\n    int cnt = 1;\n    long long sum = 0;\n    for (int i = 1; i <= n; i++){\n        if (a[i] > x) return false;   // 单个数就超了，不可能\n        if (sum + a[i] > x){ cnt++; sum = a[i]; }\n        else sum += a[i];\n    }\n    return cnt <= k;\n}"
          }
        ]
      },
      {
        "id": "m5",
        "title": "前缀和与差分",
        "meta": "套路 · 区间问题的两把刀",
        "blocks": [
          {
            "h": "前缀和：把区间求和变 O(1)",
            "html": "<code>pre[i] = a[1] + a[2] + ... + a[i]</code>，则区间 [l, r] 的和 = <code>pre[r] - pre[l-1]</code>。预处理 O(n)，之后每次查询 O(1)。这是「多次区间查询」类题目的第一反应。<b>注意</b>：和可能超 int，前缀和数组要用 long long。"
          },
          {
            "h": "前缀和模板",
            "code": "const int N = 100005;\nint a[N];\nlong long pre[N];\n\nfor (int i = 1; i <= n; i++) pre[i] = pre[i-1] + a[i];\n\nlong long rangeSum(int l, int r){ return pre[r] - pre[l-1]; }"
          },
          {
            "h": "差分：把区间修改变 O(1)",
            "html": "差分是前缀和的逆运算。要做「区间 [l,r] 全部加上 v」这种操作时，暴力每次 O(n)，m 次操作就是 O(nm)。用差分数组 <code>d</code>：只需 <code>d[l] += v; d[r+1] -= v;</code> 两步，最后求一次前缀和就得到结果。<b>这是「多次区间修改、最后一次查询」的标准解法。</b>"
          },
          {
            "h": "差分模板",
            "code": "int d[100005];        // 差分数组\n\nvoid addRange(int l, int r, int v){   // [l,r] 全部加 v，O(1)\n    d[l] += v;\n    d[r+1] -= v;\n}\n\n// 全部操作结束后，求前缀和还原真实值\nint cur = 0;\nfor (int i = 1; i <= n; i++){\n    cur += d[i];\n    a[i] = cur;\n}"
          },
          {
            "h": "二维前缀和",
            "html": "二维也能前缀和：<code>pre[i][j]</code> 表示左上角 (1,1) 到 (i,j) 的矩形和。查询任意子矩形用容斥：<code>pre[x2][y2] - pre[x1-1][y2] - pre[x2][y1-1] + pre[x1-1][y1-1]</code>。记忆口诀：<b>大面积减小面积，减去两条带，加回重叠的小块</b>。"
          },
          {
            "h": "何时用哪个",
            "list": [
              "多次<b>查询</b>区间和 → 前缀和",
              "多次<b>修改</b>区间、最后统一查询 → 差分",
              "同时有修改和查询 → 需要树状数组/线段树（超出本板块范围）",
              "注意：前缀和数组通常从下标 1 开始，<code>pre[0] = 0</code> 作为哨兵，能省掉边界特判"
            ]
          }
        ]
      },
      {
        "id": "m6",
        "title": "离散化",
        "meta": "套路 · 把大值域变小",
        "blocks": [
          {
            "h": "为什么需要离散化",
            "html": "有些题目数值范围极大（比如 10⁹），但你只关心它们的<b>相对大小</b>，或者需要用值当数组下标（值域太大开不下数组）。这时把 n 个原始值映射成 1~n 的排名，问题规模就从「值域」变成「个数」，数组就开得下了。"
          },
          {
            "h": "典型场景",
            "html": "① 树状数组统计逆序对，但 a[i] 可达 10⁹，无法开 10⁹ 大小的数组；② 坐标范围 10⁹ 的线段覆盖问题；③ 需要「排名」而非具体值的统计题。<br>关键洞察：<b>只有大小关系有意义时，绝对值可以丢掉</b>。"
          },
          {
            "h": "离散化三步走",
            "html": "① 把所有值复制到临时数组 <code>b</code>；② 排序并去重；③ 对每个 <code>a[i]</code>，用 <code>lower_bound</code> 求出它在新数组里的位置（1 开始），作为新值。"
          },
          {
            "h": "离散化模板",
            "code": "#include <algorithm>\nint a[100005], b[100005];\nint n;\n\n// ① 复制\nfor (int i = 1; i <= n; i++) b[i] = a[i];\n\n// ② 排序 + 去重\nsort(b + 1, b + n + 1);\nint m = unique(b + 1, b + n + 1) - (b + 1);   // 去重后元素个数\n\n// ③ 映射为 1~m 的排名\nfor (int i = 1; i <= n; i++)\n    a[i] = lower_bound(b + 1, b + m + 1, a[i]) - b;"
          },
          {
            "h": "必须注意的两点",
            "list": [
              "<code>unique</code> 只把重复元素移到末尾，并不真正删除，所以必须配合 <code>erase</code> 或取长度差来用。",
              "离散化后 a[i] 变成排名，<b>原始值就丢了</b>。如果后续还需要原值，得另开数组保存。",
              "相等元素会映射到同一个排名——这正是我们要的效果（相同值不该有严格大小之分）。"
            ]
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：给 n 个数，问有多少对 (i&lt;j) 满足 a[i]&lt;a[j]，其中 a[i] 可达 10⁹。<br><b>思路</b>：先离散化成 1~n 的排名，就可以用树状数组按值统计（或用归并排序直接算逆序对）。离散化本身不改变答案，因为它保留了全部大小关系。"
          }
        ]
      },
      {
        "id": "m7",
        "title": "调试与 RE/TLE/MLE 排查",
        "meta": "调试 · 从报错反推 bug",
        "blocks": [
          {
            "h": "先学会读评测结果",
            "html": "不同结果对应不同病因，按这个顺序排查效率最高。很多人看到 WA 就去改算法，结果改了三小时发现是数组开小了。"
          },
          {
            "h": "错误类型对照表",
            "list": [
              "<b>CE</b>（编译错误）：语法问题，看第一行报错，别被后面的连锁报错带偏。",
              "<b>WA</b>（答案错误）：逻辑问题。先测小数据、边界数据，再考虑算法本身。",
              "<b>TLE</b>（超时）：复杂度过高，或死循环。先确认循环能退出，再算复杂度。",
              "<b>RE</b>（运行错误）：数组越界、除零、栈溢出、访问空指针。九成是越界。",
              "<b>MLE</b>（内存超限）：数组开太大，常见于二维数组或递归太深。",
              "<b>OLE</b>（输出超限）：通常是死循环里在输出，或格式多余。"
            ]
          },
          {
            "h": "RE 的三大元凶",
            "html": "① <b>数组越界</b>：下标算错，尤其循环边界写 <code>&lt;=n</code> 而数组只开到 n；② <b>除零</b>：<code>a / b</code> 而 b 恰好为 0（比如 n=0 时求平均）；③ <b>栈溢出</b>：递归层数太深（10⁵ 层必爆），或局部数组开太大（<code>int a[1000000]</code> 放函数里）。"
          },
          {
            "h": "TLE 的两种可能",
            "html": "第一种是<b>算法复杂度真的超了</b>——用数据范围反推，10⁵ 的数据写了 O(n²) 必然超。第二种是<b>死循环</b>——循环变量没推进，或者 while 条件永远为真。区分方法：小数据也超时 → 死循环；只有大数据超 → 复杂度问题。"
          },
          {
            "h": "杀死循环的常见写法",
            "code": "// 错误：i 从不改变，死循环\nint i = 0;\nwhile (i < n) { sum += a[i]; }\n\n// 错误：无符号数减到 0 再减会回绕成极大值\nfor (unsigned i = n - 1; i >= 0; i--) { }\n\n// 正确：有符号且条件正确\nfor (int i = n - 1; i >= 0; i--) { }"
          },
          {
            "h": "调试三板斧",
            "html": "<b>① 打印中间量</b>：在关键位置输出变量值，看它从哪一步开始偏离预期。<b>② 缩小数据</b>：把 n 从 10⁵ 降到 5，手算答案对比。<b>③ 二分定位</b>：注释掉后半段代码，看前半段是否正常，快速锁定问题区域。"
          },
          {
            "h": "写给自己的断言",
            "html": "在容易出错的地方加断言，程序会立刻停在违规处，比到处打印高效。提交前记得注释掉，否则评测机上触发断言会直接 RE。"
          },
          {
            "h": "断言用法",
            "code": "#include <cassert>\n\nint pos = lower_bound(a, a + n, x) - a;\nassert(pos >= 0 && pos <= n);   // 越界就立刻报错停机\n\n// 提交前：#define NDEBUG 可以关闭所有 assert"
          }
        ]
      },
      {
        "id": "m8",
        "title": "考场策略",
        "meta": "心态 · 时间分配",
        "blocks": [
          {
            "h": "4 题 3.5 小时怎么分",
            "html": "CSP-S 复赛一般 4 题、3.5 小时（210 分钟）。推荐分配：<b>读题 20 分钟</b>（四题全读一遍，判断难度）→ <b>每题 40~50 分钟</b>作答 → <b>留 20 分钟检查</b>。不要一上来就死磕第一题，也不要因为第一题简单就慢慢磨。"
          },
          {
            "h": "先易后难，但要先读全",
            "html": "读完四题再决定顺序。经常出现「第三题比第一题简单」的情况——因为题目顺序不等于难度顺序。正确做法：先花 20 分钟读完全部题，按「有把握 / 有思路 / 完全不会」分类，然后从有把握的开始。"
          },
          {
            "h": "暴力分也是分",
            "html": "一道题 100 分，往往有 30~60 分是给暴力/部分分的（数据范围小）。不会正解时，<b>一定要写暴力拿部分分</b>，而不是空着。从「0 分」变「40 分」的收益，远大于在某道题上死磕 1 小时可能拿到的 20 分。"
          },
          {
            "h": "交卷前检查清单",
            "list": [
              "文件名和题目要求一致（文件 IO 赛制尤其致命）",
              "数组大小够不够（按数据范围上限 + 5 开）",
              "该用 long long 的地方有没有用（求和、乘积、计数）",
              "多组数据有没有清空全局数组和计数器",
              "边界：n=1、全相同、最大值、负数",
              "freopen 是否需要注释（本模拟器不需要文件 IO）",
              "有没有残留的调试输出（会直接导致 WA）",
              "代码是否已保存（本模拟器会自动存，但确认一次更安心）"
            ]
          },
          {
            "h": "心态上的三条铁律",
            "html": "① <b>不比较</b>：别看旁边人敲得多快，他的代码可能一堆 bug；② <b>不回头</b>：一道题放弃后就不要反复想，专注当前题；③ <b>留后手</b>：每题先交一版能过的暴力，再优化，保证任何时候都有分在兜底。"
          },
          {
            "h": "一道题的标准流程",
            "html": "读题 → 手算样例理解题意 → 看数据范围定复杂度 → 想暴力 → 想优化 → 写代码 → 测样例 → 测边界 → 交。这个流程走顺了，速度会自然提升。切忌「边想边写」，思路没定就敲键盘，最后往往推倒重来。"
          }
        ]
      }
    ]
  },
  "algo": {
    "title": "算法教学",
    "icon": "📚",
    "intro": "本板块按「语法 → 数据结构 → 算法思想」的顺序组织，共 11 章，参考大学《C 程序设计》课程的章节骨架。语法是地基，算法是楼——先把循环、数组、函数这些砖搬稳，才谈得上动态规划和图论。每章都包含：概念讲解、可运行代码、常见错误、小例题。左边是章节，右边是详细内容。注意：本模拟器内置的编辑器是一个教学用 C++ 子集解释器，支持 int/long long/数组/vector&lt;int&gt;/函数/递归/引用参数/switch，不支持 map/set/queue/stack/struct/指针。凡是超出范围的写法，章节里会明确标注「需本地 g++ 验证」。",
    "nodes": [
      {
        "id": "c1",
        "title": "第一章 · 基础语法",
        "meta": "语法 · 4 个要点",
        "blocks": [
          {
            "h": "1.1 程序骨架",
            "html": "每个 C++ 程序都从 <code>main</code> 函数开始执行。一个完整的最小程序包含三部分：<b>头文件</b>（声明你要用的工具）、<b>命名空间</b>（省去 std:: 前缀）、<b>主函数</b>（程序的入口）。"
          },
          {
            "h": "骨架代码",
            "code": "#include <iostream>   // 引入 cin / cout\nusing namespace std;  // 使用标准命名空间\n\nint main(){\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << \"\\n\";\n    return 0;         // 返回 0 表示正常结束\n}"
          },
          {
            "h": "1.2 变量与类型怎么选",
            "html": "选类型的唯一标准是「数据范围」。竞赛里 90% 的 WA 和 TLE 都跟类型选错有关，记住这张表：<ul class=\"rev-ul\"><li><code>int</code>：约 ±2.1×10⁹（2³¹-1）。两个 int 相乘可能溢出，比如 10⁵×10⁵。</li><li><code>long long</code>：约 ±9×10¹⁸。凡是「求和」「乘积」「计数」的结果，先怀疑要不要 long long。</li><li><code>double</code>：15~16 位有效数字。不能用来做精确相等比较。</li><li><code>char</code>：一个字节，既可当字符 <code>a</code>，也可当 -128~127 的小整数。</li><li><code>bool</code>：true / false，参与运算时当作 1 / 0。</li></ul>"
          },
          {
            "h": "1.3 溢出的经典现场",
            "html": "看这段「求 1 到 n 的和」——n 只有 10⁵ 时，答案约 5×10⁹，已经超过 int 上限。必须把累加变量声明成 <code>long long</code>，并且让参与运算的量也是 long long。"
          },
          {
            "h": "类型溢出示例",
            "code": "int n = 100000;\nlong long sum = 0;        // 关键：用 long long\nfor (int i = 1; i <= n; i++) sum += i;   // 5000050000\ncout << sum << \"\\n\";\n\n// 反例：int sum = 0; 结果会是负数或乱数\n// 另一个反例：long long x = n * n;  ← n*n 先按 int 算，已经溢出"
          },
          {
            "h": "1.4 常量与数组上限",
            "html": "竞赛代码习惯把最大规模写成常量，放在全局位置。好处是：改一处即可，且不会出现「数组开小了」。全局数组还有额外福利——它默认初始化为 0，而局部数组不会。"
          },
          {
            "h": "常量写法",
            "code": "const int N = 100005;   // 数据上限 + 5 的余量\nint a[N];               // 全局数组，自动清零，可开得比较大\n\nint main(){\n    int b[100];         // 局部数组，内容是随机垃圾\n    for (int i = 0; i < 100; i++) b[i] = 0;  // 必须自己清\n}"
          },
          {
            "h": "1.5 运算符与优先级",
            "html": "算术 <code>+ - * / %</code>、关系 <code>&lt; &gt; &lt;= &gt;= == !=</code>、逻辑 <code>&& || !</code>。两个必须记住的点：<br>① <b>整数除法会截断</b>：<code>7/2</code> 得 3，不是 3.5；想得小数至少要有一边是 double。<br>② <b><code>=</code> 和 <code>==</code> 是两回事</b>：<code>if (x = 5)</code> 永远为真，是新手最隐蔽的 bug。"
          },
          {
            "h": "取模的坑",
            "html": "<code>%</code> 只能用于整数。负数的取模在 C++ 中结果符号跟随被除数：<code>-7 % 3</code> 得 -1，而不是 2。如果题目要求「非负余数」，写成 <code>((a % m) + m) % m</code>。"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：读入半径 r（实数），输出圆面积保留 3 位小数。<br><b>思路</b>：面积 = πr²。r 必须用 double 读入；r*r 是 double 运算不会截断；输出用 fixed + setprecision(3)。<br><b>为什么不能用 int</b>：int 会截断小数部分，r=1.5 会变成 1，答案直接错。"
          }
        ]
      },
      {
        "id": "c2",
        "title": "第二章 · 顺序与输入输出",
        "meta": "语法 · 读写细节",
        "blocks": [
          {
            "h": "2.1 顺序执行模型",
            "html": "程序默认从上往下一条条执行。所谓「顺序结构」就是：读入 → 计算 → 输出。竞赛题的第一段代码几乎永远是这个形状，先把输入读干净，再处理逻辑，最后统一输出。"
          },
          {
            "h": "2.2 cin 还是 scanf",
            "html": "<code>cin &gt;&gt;</code> 写法简单、自动识别类型，缺点是慢；<code>scanf</code> 快但要自己写格式符。数据量到 10⁶ 时，cin 不加加速可能超时。加速写法只需两行，放在 main 开头。"
          },
          {
            "h": "输入加速",
            "code": "int main(){\n    ios::sync_with_stdio(false);   // 关闭与 C 流的同步\n    cin.tie(0);                    // 解除 cin 与 cout 的绑定\n    int n; cin >> n;\n}"
          },
          {
            "h": "scanf / printf 格式符",
            "html": "必须记牢：<code>int</code> 用 <code>%d</code>，<code>long long</code> 用 <code>%lld</code>，<code>double</code> 读入用 <code>%lf</code>、输出用 <code>%f</code>，<code>char</code> 用 <code>%c</code>，字符串用 <code>%s</code>。把 long long 当成 %d 输出，结果会变成一个莫名其妙的小数字——这是很常见的排查死角。"
          },
          {
            "h": "格式符示例",
            "code": "int a; long long b; double c; char d;\nscanf(\"%d %lld %lf %c\", &a, &b, &c, &d);\nprintf(\"%d %lld %.3f %c\\n\", a, b, c, d);\n// 注意：scanf 每个变量前都要加 &（取地址）"
          },
          {
            "h": "2.3 输出格式控制",
            "html": "输出「保留 k 位小数」是最常见的格式要求。两种写法等价，选一种记熟即可。注意 <code>fixed</code> 一旦打开会一直生效，影响后续所有浮点输出。"
          },
          {
            "h": "保留小数",
            "code": "#include <iomanip>\ncout << fixed << setprecision(3) << 3.14159;   // 3.142\nprintf(\"%.3f\", 3.14159);                        // 3.142\n\n// 只对某几个数生效时，记得恢复\ncout << defaultfloat;   // 恢复默认格式"
          },
          {
            "h": "2.4 常见错误",
            "list": [
              "忘记 <code>&amp;</code>：<code>scanf(\"%d\", a)</code> 会崩溃或读到垃圾值。",
              "读入字符串带空格：<code>cin &gt;&gt; s</code> 遇空格就停，要用 <code>getline(cin, s)</code>。",
              "换行符残留：<code>cin &gt;&gt; n</code> 后再 getline，会先读到一个空行，需要先 <code>getchar()</code> 吃掉。",
              "混用 cin 和 scanf：除非做了 sync 设置，否则缓冲区会打架，建议全篇只用一种。"
            ]
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：读入 n 个整数，输出它们的和与平均值（平均值保留 2 位小数）。<br><b>思路</b>：和用 long long（防溢出），平均值 = 和 × 1.0 / n（乘 1.0 强制转 double）。<br><b>易错</b>：直接写 <code>sum / n</code> 是整数除法，会丢掉小数部分。"
          }
        ]
      },
      {
        "id": "c3",
        "title": "第三章 · 选择语句",
        "meta": "语法 · 分支逻辑",
        "blocks": [
          {
            "h": "3.1 if / else if / else",
            "html": "分支的本质是「按条件挑一条路走」。多条件判断时，<code>if / else if / else</code> 是从上往下依次检查，<b>命中第一条就跳出整个结构</b>，后面的不再判断。所以条件的顺序很重要：范围小的、特殊的要放前面。"
          },
          {
            "h": "多分支示例",
            "code": "int score;\ncin >> score;\nif (score >= 90)      cout << \"A\\n\";\nelse if (score >= 75) cout << \"B\\n\";\nelse if (score >= 60) cout << \"C\\n\";\nelse                  cout << \"D\\n\";\n// 顺序必须从大到小，否则 95 分会被 score>=60 先抓走"
          },
          {
            "h": "3.2 三个经典陷阱",
            "list": [
              "<b>= 写成 ==</b>：<code>if (x = 0)</code> 把 0 赋给 x，条件恒假，循环一次都不进。",
              "<b>悬空 else</b>：<code>if (a) if (b) x++; else y++;</code> 的 else 属于内层 if，不是外层。多层 if 一定加花括号。",
              "<b>浮点数比较</b>：<code>if (a == b)</code> 对 double 不可靠，因为 0.1+0.2 不等于 0.3。要写成 <code>fabs(a-b) &lt; 1e-8</code>。"
            ]
          },
          {
            "h": "浮点比较正确写法",
            "code": "#include <cmath>\ndouble a = 0.1 + 0.2;      // 实际是 0.30000000000000004\nif (fabs(a - 0.3) < 1e-9) cout << \"相等\\n\";\nelse                       cout << \"不等\\n\";"
          },
          {
            "h": "3.3 短路求值",
            "html": "<code>a &amp;&amp; b</code>：a 为假就<b>不再计算 b</b>；<code>a || b</code>：a 为真就不再算 b。这个特性可以写出防越界的判断：<code>if (i &lt; n &amp;&amp; a[i] &gt; 0)</code> —— 当 i 越界时右边根本不会执行，不会崩。如果写成 <code>if (a[i] &gt; 0 &amp;&amp; i &lt; n)</code> 就会先访问越界内存。"
          },
          {
            "h": "3.4 switch 与贯穿",
            "html": "<code>switch</code> 适合「一个变量 vs 一堆确定值」的判断。关键规则：每个 <code>case</code> 后面要 <code>break</code>，否则会继续执行下一个分支（这叫「贯穿」）。贯穿有时是故意用的（比如多个值共享一段逻辑），但绝大多数情况是漏写 bug。"
          },
          {
            "h": "switch 示例",
            "code": "char op; cin >> op;\nswitch (op){\n    case '+': cout << a + b; break;\n    case '-': cout << a - b; break;\n    case '*':\n    case 'x': cout << a * b; break;   // 故意贯穿：两种符号同一逻辑\n    default:  cout << \"error\";\n}"
          },
          {
            "h": "3.5 三目运算符",
            "html": "<code>cond ? x : y</code> 是 if-else 的表达式版，适合赋值：<code>int mx = a &gt; b ? a : b;</code>。注意它只能放表达式，不能放语句块；嵌套两层以上就该换回 if，否则可读性崩塌。"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：判断闰年。规则：能被 4 整除且不能被 100 整除，<b>或者</b>能被 400 整除。<br><b>正确写法</b>：<code>if ((y % 4 == 0 &amp;&amp; y % 100 != 0) || y % 400 == 0)</code><br><b>易错</b>：写成 <code>y % 4 == 0</code> 就把 1900 判成闰年了。"
          }
        ]
      },
      {
        "id": "c4",
        "title": "第四章 · 循环语句",
        "meta": "语法 · 重复执行",
        "blocks": [
          {
            "h": "4.1 三种循环怎么选",
            "html": "<b>for</b>：次数已知，最常用，把「初始化 / 条件 / 步进」写在一行里，一目了然。<b>while</b>：次数未知，只要「条件成立就一直做」，比如读文件到 EOF、不断除以 2 直到 0。<b>do-while</b>：至少执行一次，适合「先做再判断」的场景，竞赛里用得少。"
          },
          {
            "h": "三种循环",
            "code": "for (int i = 1; i <= n; i++) sum += i;        // 计数循环\n\nwhile (x > 0) { cnt++; x /= 2; }              // 条件循环（求二进制位数）\n\nint k = 0;\ndo { k++; } while (k < 3);                    // k 最终为 3，至少执行一次"
          },
          {
            "h": "4.2 循环设计三步法",
            "html": "写循环前先在心里回答三个问题，几乎能消灭所有死循环和差一错误：<br>① <b>循环变量是什么</b>（下标 i？剩余量 x？时间 t？）<br>② <b>什么时候继续</b>（条件写边界，想清楚是 &lt; 还是 &lt;=）<br>③ <b>每轮怎么推进</b>（一定要让循环变量朝终止方向变化，否则永远出不来）"
          },
          {
            "h": "4.3 差一错误（off-by-one）",
            "html": "这是出现频率最高的 bug 类型。n 个元素的下标是 <code>0 ~ n-1</code>，如果习惯从 1 开始（竞赛里很常见，方便配合前缀和），那循环就该写 <code>for (int i = 1; i &lt;= n; i++)</code>。两种风格都对，但<b>必须全篇统一</b>——混着写几乎必然越界。"
          },
          {
            "h": "4.4 嵌套循环与复杂度直觉",
            "html": "两层循环不是「两倍慢」，而是「平方级慢」。n = 1000 时两层循环约 10⁶ 次操作，瞬间完成；n = 10⁵ 时是 10¹⁰ 次，必然超时。看到两层循环，立刻估算一下内层总共跑多少次，这是判断会不会 TLE 的基本功。"
          },
          {
            "h": "嵌套循环与三角形状",
            "code": "// 打印右上三角：第 i 行有 n-i+1 个 *\nfor (int i = 1; i <= n; i++){\n    for (int j = i; j <= n; j++) cout << \"*\";\n    cout << \"\\n\";\n}\n// 总次数 = n + (n-1) + ... + 1 = n(n+1)/2，仍是 O(n^2)"
          },
          {
            "h": "4.5 break 与 continue",
            "html": "<code>break</code> 立刻跳出<b>当前这一层</b>循环（不会跳出外层）；<code>continue</code> 跳过本轮剩余语句，直接进入下一轮。<br>注意：在多层循环里想「跳出全部」，break 是不够的，需要设标志位或用 goto，或者直接封装成函数 return。"
          },
          {
            "h": "跳出多层循环的正确姿势",
            "code": "bool found = false;\nfor (int i = 0; i < n && !found; i++)\n    for (int j = 0; j < m; j++)\n        if (a[i][j] == target) { found = true; break; }\n// 外层条件里带 !found，等价于一次跳出两层"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：判断 n 是否为质数。<br><b>思路</b>：从 2 试到 √n，一旦发现能整除就是合数。循环条件写 <code>i * i &lt;= n</code>，比 sqrt 更安全（无精度问题）。<br><b>易错</b>：① 忘记特判 n &lt; 2（1 不是质数）；② 循环写全 n，复杂度从 O(√n) 退化到 O(n)。"
          }
        ]
      },
      {
        "id": "c5",
        "title": "第五章 · 数组",
        "meta": "数据结构 · 最核心的容器",
        "blocks": [
          {
            "h": "5.1 数组的本质",
            "html": "数组是一段「连续的内存」，用下标访问。因为地址连续，<code>a[i]</code> 的访问是常数时间，这是它能成为所有算法基石的原因（前缀和、DP、图论存边全靠它）。C++ 下标从 <b>0</b> 开始，n 个元素的合法下标是 0 ~ n-1。"
          },
          {
            "h": "声明与访问",
            "code": "int a[10];                    // 10 个 int，下标 0~9\nfor (int i = 0; i < 10; i++) cin >> a[i];\n\nconst int N = 100005;\nint b[N];                     // 全局数组：自动全 0，可开 10 万+ 量级"
          },
          {
            "h": "5.2 数组开多大",
            "html": "规则很简单：<b>按题目数据范围的上限开，再多留几个余量</b>。看到 n ≤ 10⁵ 就写 <code>const int N = 100005;</code>。另外注意：全局数组可开到百万级（本 IDE 全局区约 96KB，约 2.4 万个 int，超出会自动回退慢速解释器）；而<b>局部数组</b>放在函数栈上，开太大会直接栈溢出崩溃。所以大数组一律放全局。"
          },
          {
            "h": "5.3 二维数组",
            "html": "二维数组就是「数组的数组」，用来存矩阵、网格、棋盘。<code>a[i][j]</code> 表示第 i 行第 j 列。开 <code>a[1005][1005]</code> 约 4MB，是竞赛里常见规模。遍历时习惯外层枚举行、内层枚举列，这样内存访问是连续的，速度更快。"
          },
          {
            "h": "二维数组示例",
            "code": "const int N = 1005;\nint g[N][N];\n\nint n, m;\ncin >> n >> m;\nfor (int i = 1; i <= n; i++)\n    for (int j = 1; j <= m; j++)\n        cin >> g[i][j];\n\nfor (int i = 1; i <= n; i++)          // 按行输出\n    for (int j = 1; j <= m; j++)\n        cout << g[i][j] << \" \\n\"[j == m];"
          },
          {
            "h": "5.4 越界是头号杀手",
            "html": "C++ <b>不会检查数组越界</b>。写 <code>a[n]</code> 时程序不会报错，而是悄悄改掉旁边变量的值——于是出现「数组明明填对了，别的变量却莫名其妙变了」这种灵异现象。排查口诀：<b>先怀疑下标，再怀疑类型，最后才怀疑算法。</b>"
          },
          {
            "h": "5.5 初始化与清零",
            "html": "全局数组默认全 0；局部数组是随机垃圾，必须自己清。清一维数组用 <code>memset(a, 0, sizeof(a))</code>（在 <code>&lt;cstring&gt;</code> 里）。注意 memset 是按<b>字节</b>赋值的，所以只能用来清 0 或 -1，不能清成 3 或 100。"
          },
          {
            "h": "清零的正确姿势",
            "code": "#include <cstring>\nint a[1005];\nmemset(a, 0, sizeof(a));       // 全 0，正确\nmemset(a, -1, sizeof(a));      // 全 -1，正确\n// memset(a, 1, sizeof(a));    // 错误！会变成 0x01010101\n\n// 想清成别的值，只能循环\nfor (int i = 0; i < 1005; i++) a[i] = 7;"
          },
          {
            "h": "5.6 数组的三大经典用法",
            "html": "<b>① 计数桶</b>：下标当数值，值当出现次数，O(1) 查询频次。<br><b>② 前缀和</b>：预处理后 O(1) 求任意区间和，是「区间查询」类题目的第一反应。<br><b>③ 存图/存状态</b>：邻接表、DP 状态表、并查集父指针，本质都是数组。"
          },
          {
            "h": "前缀和模板",
            "code": "const int N = 100005;\nint a[N];\nlong long pre[N];            // 前缀和可能超 int\n\nfor (int i = 1; i <= n; i++) pre[i] = pre[i-1] + a[i];\n\n// 查询区间 [l, r] 的和，O(1)\nlong long ans = pre[r] - pre[l-1];"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：给 n 个数，m 次询问，每次问区间 [l, r] 的和。<br><b>暴力</b>：每次循环累加，O(nm)，n=m=10⁵ 时是 10¹⁰，超时。<br><b>前缀和</b>：预处理 O(n)，每次查询 O(1)，总 O(n+m)。这就是「用空间换时间」的最朴素形态。"
          }
        ]
      },
      {
        "id": "c6",
        "title": "第六章 · 函数与递归",
        "meta": "语法 · 代码复用",
        "blocks": [
          {
            "h": "6.1 函数的意义",
            "html": "函数把一段逻辑打包，起个名字，随时调用。三个好处：<b>复用</b>（写一次调十次）、<b>可读</b>（solve() 比一大坨代码好懂）、<b>可调试</b>（能单独测一段逻辑）。竞赛代码里，把「读入」「求解」「输出」拆成三个函数，是很好的工程习惯。"
          },
          {
            "h": "函数定义与值传递",
            "code": "int add(int x, int y){        // 返回 int，接收两个 int\n    return x + y;\n}\n\nint main(){\n    int s = add(3, 5);        // 8\n    cout << s;\n}\n\n// 值传递：函数里的 x,y 是副本，改它们不影响外面的变量"
          },
          {
            "h": "6.2 引用参数：让函数能改外面的值",
            "html": "如果函数需要「修改调用者的变量」，参数前加 <code>&amp;</code>。典型用途是「传入数组 + 返回多个结果」，或者避免大数组拷贝（不加 &amp; 会复制整个数组，既慢又费内存）。注意本 IDE 支持<b>引用参数</b>，但<b>不支持引用变量</b>（如 <code>int &amp;r = a;</code>）。"
          },
          {
            "h": "引用参数示例",
            "code": "void swap2(int &a, int &b){    // 引用参数：直接改原变量\n    int t = a; a = b; b = t;\n}\n\nvoid getMinMax(int a[], int n, int &mn, int &mx){  // 返回两个结果\n    mn = mx = a[0];\n    for (int i = 1; i < n; i++){\n        if (a[i] < mn) mn = a[i];\n        if (a[i] > mx) mx = a[i];\n    }\n}"
          },
          {
            "h": "6.3 递归三要素",
            "html": "递归就是「函数调用自己」。写对递归只需想清三件事，缺一不可：<br>① <b>终止条件</b>（什么时候不再往下叫，直接返回）<br>② <b>递推关系</b>（大问题怎么用小问题的答案拼出来）<br>③ <b>规模缩小</b>（每次调用参数必须更接近终止条件，否则无限递归爆栈）"
          },
          {
            "h": "递归示例：阶乘与斐波那契",
            "code": "long long fact(int n){\n    if (n <= 1) return 1;          // ① 终止条件\n    return n * fact(n - 1);        // ②③ 递推 + 缩小规模\n}\n\nint fib(int n){\n    if (n <= 2) return 1;\n    return fib(n-1) + fib(n-2);    // 朴素写法：O(2^n)，n=40 就卡死\n}"
          },
          {
            "h": "6.4 递归的代价",
            "html": "递归的每一层都占用栈空间。层数太深（比如 10⁵ 层）会「栈溢出」——程序直接崩溃，不给你任何提示。另外朴素斐波那契那种「同一个子问题被反复计算」的递归，复杂度会指数爆炸。解决办法是<b>记忆化</b>：把算过的答案存进数组，下次直接取。这正是后面动态规划的思想起点。"
          },
          {
            "h": "记忆化改造",
            "code": "long long memo[100];\n\nlong long fib(int n){\n    if (n <= 2) return 1;\n    if (memo[n]) return memo[n];        // 算过就直接返回\n    return memo[n] = fib(n-1) + fib(n-2);  // 存下来再返回\n}\n// 复杂度从 O(2^n) 降到 O(n)"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：用递归求 n 的阶乘（n ≤ 20）。<br><b>要点</b>：返回值必须是 long long，20! 约 2.4×10¹⁸，正好在 long long 范围内，用 int 早就爆了。<br><b>追问</b>：n 到 10⁵ 怎么办？递归会爆栈，要改成循环或记忆化。"
          }
        ]
      },
      {
        "id": "c7",
        "title": "第七章 · 字符串",
        "meta": "语法 · 文本处理",
        "blocks": [
          {
            "h": "7.1 字符与字符串的区别",
            "html": "<code>char</code> 是<b>单个</b>字符，用单引号：<code>'a'</code>。<code>\"abc\"</code> 是<b>字符串</b>，用双引号——它在 C++ 里本质是一个「以 0 结尾的字符数组」（C 风格字符串）。这个结尾的 <code>'\\0'</code> 至关重要：所有字符串函数都靠它判断到哪结束。"
          },
          {
            "h": "字符数组的声明与读入",
            "code": "char s[105];          // 最多存 104 个字符 + 结尾 0\ncin >> s;             // 遇空格/换行停止，适合读单词\n\nchar line[1005];\ncin.getline(line, 1005);   // 读一整行（含空格）"
          },
          {
            "h": "7.2 常用字符串函数",
            "html": "都在 <code>&lt;cstring&gt;</code> 里：<code>strlen(s)</code> 求长度（不含结尾 0，复杂度 O(n)，别在循环条件里反复调用）；<code>strcmp(a,b)</code> 比较字典序（返回 0 表示相等，负数表示 a&lt;b）；<code>strcpy(a,b)</code> 复制；<code>strcat(a,b)</code> 拼接。"
          },
          {
            "h": "遍历与统计",
            "code": "#include <cstring>\nchar s[1005];\ncin >> s;\n\nint len = strlen(s);       // 先存下来，别每次都算\nint digits = 0, letters = 0;\nfor (int i = 0; i < len; i++){\n    if (s[i] >= '0' && s[i] <= '9') digits++;\n    else if (s[i] >= 'a' && s[i] <= 'z') letters++;\n}\ncout << digits << \" \" << letters;"
          },
          {
            "h": "7.3 大小写转换的小技巧",
            "html": "ASCII 码有规律：小写字母 <code>'a'~'z'</code> 是 97~122，大写 <code>'A'~'Z'</code> 是 65~90，对应字母相差正好 32。所以 <code>s[i] - 'a' + 'A'</code> 就是转大写，不用记魔法数字。"
          },
          {
            "h": "大小写转换",
            "code": "char c;\ncin >> c;\nif (c >= 'a' && c <= 'z') c = c - 'a' + 'A';   // 转大写\ncout << c;\n\n// 也可以用内置函数（需 <cctype>）\n// toupper(c) / tolower(c)"
          },
          {
            "h": "7.4 关于 std::string",
            "html": "标准 C++ 提供 <code>std::string</code>，能自动管理长度、支持 <code>+</code> 拼接和 <code>s.length()</code>，写起来比字符数组舒服，是实际工程的首选。<br><b>但注意</b>：本模拟器的 IDE 是教学用子集解释器，<b>不完整支持 std::string</b>，请用字符数组练习（<code>cin &gt;&gt; s</code>、<code>s[i]</code>、<code>strlen</code>、<code>strcmp</code>、<code>strcpy</code>、<code>strcat</code> 均已支持，且跑在 VM 上），真实比赛环境（g++）两种都可以用。"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：读入一个只含小写字母的字符串，统计每个字母出现次数。<br><b>思路</b>：开 <code>int cnt[26]</code>，把字符减去 <code>'a'</code> 当下标：<code>cnt[s[i]-'a']++</code>。这是「字符映射到数组下标」的标准套路，后面学哈希表时你会发现它就是这个思想的最简版。"
          }
        ]
      },
      {
        "id": "c8",
        "title": "第八章 · 结构体",
        "meta": "语法 · 打包数据",
        "blocks": [
          {
            "h": "8.1 为什么需要结构体",
            "html": "数组只能存「同类型的一串数据」。但现实对象往往是<b>多属性的组合</b>：一个学生有姓名、学号、成绩；一条边有起点、终点、边权。把这几项绑成一个整体，就是结构体。它的最大价值是<b>排序</b>——可以按某个字段整体搬动所有属性，而不是手忙脚乱地同步交换几个平行数组。"
          },
          {
            "h": "8.2 struct 的定义与使用",
            "html": "语法：<code>struct 名字 { 成员; };</code> 注意结尾的分号不能少。定义后它就是新类型，可以像 int 一样声明变量、开数组、做参数。<br><b>本 IDE 的限制</b>：内置编辑器<b>不支持 struct</b>（解释器未实现），下面的代码请用本地 g++ 验证。在本模拟器里练习时，用「平行数组」代替（见后文）。"
          },
          {
            "h": "struct 示例（需 g++）",
            "code": "struct Student {\n    int id;\n    int score;\n};                    // ← 分号别漏\n\nStudent a[1005];\na[0].id = 1;\na[0].score = 95;"
          },
          {
            "h": "8.3 排序与自定义比较",
            "html": "<code>sort</code> 默认只认基本类型的大小。给结构体排序时必须告诉它「按哪个字段比」，方法是写一个 <code>cmp</code> 函数：返回 true 表示「a 应该排在 b 前面」。想降序就把比较符号反过来。切记：cmp 必须是<b>严格弱序</b>（不能用 <code>&lt;=</code>），否则 sort 可能越界崩溃。"
          },
          {
            "h": "cmp 示例（需 g++）",
            "code": "#include <algorithm>\n\nbool cmp(const Student &a, const Student &b){\n    if (a.score != b.score) return a.score > b.score;  // 分数高的在前\n    return a.id < b.id;                                // 同分按学号升序\n}\nsort(a, a + n, cmp);"
          },
          {
            "h": "8.4 在本模拟器里怎么练：平行数组",
            "html": "既然 IDE 不支持 struct，就用两个数组「心照不宣地绑定」：<code>id[i]</code> 和 <code>score[i]</code> 描述同一个人，交换时一起交换。虽然啰嗦，但能完整练到排序逻辑，而且比赛里临时救急也常用这招。"
          },
          {
            "h": "平行数组模拟结构体",
            "code": "int id[1005], score[1005];\nint n; cin >> n;\nfor (int i = 0; i < n; i++) cin >> id[i] >> score[i];\n\n// 按分数降序冒泡排序，两个数组同步交换\nfor (int i = 0; i < n; i++)\n    for (int j = 0; j + 1 < n - i; j++)\n        if (score[j] < score[j+1]){\n            int t = score[j]; score[j] = score[j+1]; score[j+1] = t;\n            t = id[j]; id[j] = id[j+1]; id[j+1] = t;\n        }"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：n 个学生，按成绩降序输出学号，同分按学号升序。<br><b>关键</b>：cmp 里必须先比成绩，成绩相同再比学号——这叫「多关键字排序」，等价于按 (成绩降序, 学号升序) 的字典序比较。<b>易错</b>：只写成绩比较，同分时顺序不稳定，答案会随机错。"
          }
        ]
      },
      {
        "id": "c9",
        "title": "第九章 · 指针基础",
        "meta": "语法 · 内存地址",
        "blocks": [
          {
            "h": "9.1 什么是指针",
            "html": "内存里每个字节都有编号，这个编号就是<b>地址</b>。指针就是一个「存地址的变量」。<code>int *p = &amp;a;</code> 把 a 的地址存进 p；<code>*p</code> 表示「顺着地址找过去，取那个值」。记住两个符号：<code>&amp;</code> 取地址，<code>*</code> 解引用。"
          },
          {
            "h": "指针基本操作",
            "code": "int a = 10;\nint *p = &a;      // p 指向 a\ncout << p;        // 打印地址（一串十六进制）\ncout << *p;       // 10，解引用取值\n*p = 20;          // 等价于 a = 20\ncout << a;        // 20"
          },
          {
            "h": "9.2 指针与数组的关系",
            "html": "数组名在多数场合会「退化为」首元素地址，所以 <code>a</code> 和 <code>&amp;a[0]</code> 等价。<code>*(a + i)</code> 就是 <code>a[i]</code>——这就是为什么下标从 0 开始：它本质是「偏移 i 个元素再解引用」。指针加法按<b>元素大小</b>跳，不是按字节跳。"
          },
          {
            "h": "9.3 为什么竞赛里很少直接写指针",
            "html": "指针强大但危险：忘记释放会内存泄漏，越界访问会静默改坏数据，野指针直接导致段错误。现代竞赛代码几乎不手动 new/delete，需要「传引用」时用引用参数，需要「动态数组」时用 <code>vector</code>。所以学指针的主要目的，是<b>看懂别人代码和搞懂底层</b>，而不是天天用它。"
          },
          {
            "h": "9.4 用引用替代指针",
            "html": "实际写题时，凡是想「通过参数修改外部变量」，引用参数就够了，语法也干净得多。只有真要做链表、树这类结构时，才需要指针（而竞赛里通常用数组模拟）。<br><b>本 IDE 限制</b>：不支持指针与引用变量，本章代码需 g++ 验证。"
          },
          {
            "h": "引用 vs 指针",
            "code": "// 引用参数：干净、安全，推荐\nvoid addOne(int &x){ x++; }\n\n// 指针版：需要判空、需要解引用，啰嗦\nvoid addOnePtr(int *x){ if (x) (*x)++; }\n\nint main(){\n    int a = 1;\n    addOne(a);        // a 变成 2\n    addOnePtr(&a);    // a 变成 3\n}"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：写函数同时求出数组最大值和它的下标。<br><b>思路</b>：用两个引用参数带回结果，数组用 <code>int a[]</code> 传入（自动按地址传递，不拷贝）。<br><b>注意</b>：数组作参数时长度会丢失，必须额外传一个 n，这是 C++ 的固定规矩。"
          }
        ]
      },
      {
        "id": "c10",
        "title": "第十章 · 文件操作",
        "meta": "比赛 · 输入输出重定向",
        "blocks": [
          {
            "h": "10.1 为什么比赛要管文件",
            "html": "CSP-S / NOI 的传统赛制是<b>文件输入输出</b>：程序从 <code>题目名.in</code> 读，写到 <code>题目名.out</code>。如果文件名写错、忘记重定向，评测就是 0 分——这是每年都有大量选手踩的坑。现在多数比赛已改为标准输入输出，但文件操作仍是必须掌握的技能。"
          },
          {
            "h": "10.2 freopen 用法",
            "html": "<code>freopen</code> 把标准流重定向到文件，之后所有 <code>cin</code>/<code>cout</code> 都自动走文件，代码主体完全不用改。三行搞定：一行重定向输入，一行重定向输出，最后 fclose。"
          },
          {
            "h": "freopen 模板",
            "code": "#include <cstdio>\n#include <iostream>\nusing namespace std;\n\nint main(){\n    freopen(\"test.in\", \"r\", stdin);    // 从文件读\n    freopen(\"test.out\", \"w\", stdout);  // 写到文件\n\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << \"\\n\";\n\n    fclose(stdin);\n    fclose(stdout);\n    return 0;\n}"
          },
          {
            "h": "10.3 三个致命细节",
            "list": [
              "<b>文件名必须一字不差</b>：题目叫 <code>apple</code> 就写 <code>apple.in</code>，写成 <code>apples.in</code> 直接 0 分。",
              "<b>别忘了 fclose</b>：不关文件可能丢数据（尤其是 cout 缓冲没刷出去）。",
              "<b>调试时注释掉 freopen</b>：很多人本地测试完忘删，提交后在评测机上打不开文件，直接 RE。"
            ]
          },
          {
            "h": "10.4 专业做法：条件编译",
            "html": "更安全的写法是用宏控制：本地开着方便调试，提交前改一个常量就关闭，永远不会忘。"
          },
          {
            "h": "条件编译模板",
            "code": "#define LOCAL 0      // 提交前置 0，本地调试置 1\n\nint main(){\n#if LOCAL\n    freopen(\"test.in\", \"r\", stdin);\n    freopen(\"test.out\", \"w\", stdout);\n#endif\n    // 主体代码，永远不用改\n}"
          },
          {
            "h": "10.5 本模拟器怎么处理",
            "html": "本模拟器的评测面板使用<b>标准输入输出</b>（测试点数据直接喂给 stdin），所以你在这里写代码<b>不要加 freopen</b>，否则读不到数据。这与近几年 CSP-S 的实际赛制一致。"
          }
        ]
      },
      {
        "id": "c11",
        "title": "第十一章 · STL 标准模板库",
        "meta": "工具 · 常用容器",
        "blocks": [
          {
            "h": "11.1 STL 是什么",
            "html": "STL 是 C++ 标准库提供的「现成数据结构 + 算法」，用好了能省下大量手写代码的时间。竞赛里最常用的四样：<code>vector</code>（动态数组）、<code>sort</code>（排序）、<code>lower_bound</code>（二分查找）、<code>string</code>（字符串）。掌握这四个，能覆盖一大半题目需求。"
          },
          {
            "h": "11.2 vector：会自己变长的数组",
            "html": "<code>vector&lt;int&gt;</code> 是动态数组，能随时 push_back 追加，不用预先知道长度。它保留了数组的 O(1) 随机访问，是「长度不确定」时的首选。<b>本 IDE 支持 <code>vector&lt;int&gt;</code></b>，可以放心练。"
          },
          {
            "h": "vector 基本操作",
            "code": "#include <vector>\nvector<int> v;\n\nv.push_back(3);        // 尾部追加\nv.push_back(1);\ncout << v.size();      // 2\ncout << v[0];          // 3，随机访问\n\n// 范围 for 遍历（简洁）\nfor (int x : v) cout << x << \" \";\n\nv.pop_back();          // 删尾部\nv.clear();             // 清空"
          },
          {
            "h": "11.3 sort：一行排序",
            "html": "<code>sort(v.begin(), v.end())</code> 默认升序，复杂度 O(n log n)——这是理论上比较排序的最优复杂度，自己手写冒泡（O(n²)）在 n=10⁵ 时必然超时。降序用 <code>sort(v.rbegin(), v.rend())</code>，或者传 cmp。"
          },
          {
            "h": "sort 示例",
            "code": "#include <algorithm>\nint a[5] = {3, 1, 4, 1, 5};\nsort(a, a + 5);                 // 1 1 3 4 5\n\nvector<int> v = {3, 1, 4};\nsort(v.begin(), v.end());       // 升序\nsort(v.rbegin(), v.rend());     // 降序"
          },
          {
            "h": "11.4 二分查找：lower_bound",
            "html": "<b>前提：序列必须有序</b>。<code>lower_bound</code> 返回第一个「大于等于」目标值的位置，<code>upper_bound</code> 返回第一个「严格大于」的位置，复杂度 O(log n)。两者相减就是目标值出现的次数——这是「统计频次」的常用技巧。"
          },
          {
            "h": "lower_bound 示例",
            "code": "#include <algorithm>\nint a[6] = {1, 2, 2, 2, 5, 9};\nint n = 6;\n\nint *p = lower_bound(a, a + n, 2);   // 指向第一个 2\nint *q = upper_bound(a, a + n, 2);   // 指向 5\ncout << q - p;                        // 3，2 出现了 3 次\n\n// vector 版本：返回下标\n// int idx = lower_bound(v.begin(), v.end(), x) - v.begin();"
          },
          {
            "h": "11.5 本 IDE 的支持情况",
            "list": [
              "✅ 支持：<code>vector&lt;int&gt;</code>、<code>sort</code>、数组、<code>min</code>/<code>max</code>/<code>abs</code>/<code>swap</code>",
              "❌ 不支持：<code>map</code>、<code>set</code>、<code>queue</code>、<code>stack</code>、<code>priority_queue</code>、嵌套 vector",
              "❌ 不支持：<code>struct</code>、<code>class</code>、指针、引用变量",
              "⚠️ <code>long long</code> 超过 2⁵³ 会失真（正常比赛不影响）",
              "结论：在本模拟器里练「数组 + 循环 + 排序 + 二分」足够；用到容器时请用本地 g++ 验证。"
            ]
          },
          {
            "h": "11.6 没有 queue 怎么办：手写队列",
            "html": "队列就是「先进先出」，用数组 + 两个指针就能模拟：<code>head</code> 指向队头，<code>tail</code> 指向队尾下一个空位。入队 <code>q[tail++] = x</code>，出队 <code>q[head++]</code>。这个技巧在写 BFS 时几乎必用，而且比 STL 更快。"
          },
          {
            "h": "手写队列与栈",
            "code": "int q[100005];\nint head = 0, tail = 0;\n\nq[tail++] = 10;          // push 入队\nq[tail++] = 20;\nint front = q[head++];   // pop 队头，得 10\nbool empty = (head == tail);\n\n// 栈：后进先出，只用一个指针\nint st[100005], top = 0;\nst[top++] = 1;           // push\nint x = st[--top];       // pop"
          },
          {
            "h": "小例题",
            "html": "<b>题</b>：给 n 个数和 m 次询问，每次问「值 x 出现了几次」。<br><b>思路</b>：先 sort 排序（O(n log n)），每次用 upper_bound - lower_bound 求频次（O(log n)），总复杂度 O((n+m) log n)。<br><b>对比</b>：不排序直接扫描每次询问要 O(nm)，会被卡。<b>这就是「排序 + 二分」的经典组合。</b>"
          }
        ]
      }
    ]
  },
  "preexam": {
    "title": "考前注意事项",
    "icon": "⚠️",
    "intro": "这一板块是「保命手册」：环境怎么用、东西怎么带、代码怎么交、哪里最容易爆零。技术能力决定你的上限，这些细节决定你的下限。每年都有大量选手因为忘注释 freopen、文件名写错、数组开小而与奖项擦肩——这些都不是能力问题，是准备问题。考前把 8 个主题过一遍，能挡掉大部分非技术性失分。",
    "nodes": [
      {
        "id": "p1",
        "title": "考试环境与 NOI Linux",
        "meta": "环境 · 提前熟悉",
        "blocks": [
          {
            "h": "真实的比赛环境长什么样",
            "html": "CSP-S 复赛使用 <b>NOI Linux 2.0</b>，基于 Ubuntu，桌面是轻量窗口管理器。桌面上通常有题目压缩包、编辑器和终端入口。本模拟器就是按这个形态做的：每题一个 zip、有编辑器、有终端，让你提前习惯「文件在哪、怎么打开、怎么运行」。"
          },
          {
            "h": "可用的编辑器",
            "html": "考场常见的是 <b>Code::Blocks</b>、<b>Geany</b>、<b>VS Code</b>（部分赛区）、以及 <b>vim</b>。建议考前至少熟练一个图形化编辑器 + 会一点 vim 应急。本模拟器的内置编辑器操作逻辑与常见 IDE 一致：写代码、点运行、看输出。"
          },
          {
            "h": "编译器与编译命令",
            "html": "核心是 <b>g++</b>。命令行编译标准写法：<code>g++ -O2 -std=c++14 a.cpp -o a</code>，然后 <code>./a</code> 运行。参数含义：<code>-O2</code> 开优化（评测机也会开，本地开能对齐性能），<code>-std=c++14</code> 指定标准。<b>务必本地用 -O2 测试</b>，否则你本地不超时的代码可能在评测机超时（或反之）。"
          },
          {
            "h": "命令行编译与运行",
            "code": "g++ -O2 -std=c++14 -o a a.cpp   # 编译\n./a < a.in > a.out              # 运行，重定向输入输出\n\ntime ./a < a.in                 # 测量运行时间\ndiff a.out a.ans                # 与标准答案比对"
          },
          {
            "h": "提前熟悉什么",
            "list": [
              "终端基本命令：<code>cd</code> 换目录、<code>ls</code> 看文件、<code>cat</code> 看内容、<code>unzip</code> 解压",
              "编辑器怎么打开文件、怎么保存（<b>Ctrl+S 一定要按</b>）",
              "怎么编译、怎么看编译错误、怎么运行",
              "测试数据放在哪个目录、怎么用重定向喂输入",
              "怎么提交/交卷（各赛区方式不同，考前务必问监考老师）"
            ]
          },
          {
            "h": "不要浪费时间在环境上",
            "html": "考试开始后环境问题不该占你超过 5 分钟。如果解压失败、编辑器打不开、找不到题目，<b>立刻举手问监考老师</b>——这不是作弊，这是正常求助。自己折腾半小时才是真正的损失。"
          }
        ]
      },
      {
        "id": "p2",
        "title": "携带物品与证件",
        "meta": "准备 · 别到门口才发现",
        "blocks": [
          {
            "h": "必带清单",
            "list": [
              "<b>准考证</b>（纸质，多打印一份备用）",
              "<b>身份证</b>或户口本（与报名信息一致）",
              "<b>黑色签字笔</b>（可能要签承诺书）",
              "<b>水</b>（透明瓶，部分赛区允许）",
              "<b>外套</b>（机房空调常年很冷，3.5 小时坐着不动会冻僵）",
              "<b>手表</b>（非智能，部分赛区允许；考场一般也有时钟）"
            ]
          },
          {
            "h": "绝对不要带",
            "html": "<b>手机、智能手表、耳机、U 盘、任何电子设备</b>——一旦被发现在身上，无论是否使用，都可能按违纪处理，直接取消成绩。进考场前把手机交给带队老师或关机放进包里存到指定位置。另外<b>不要带纸质资料</b>进考场（包括自己打印的模板），这也是违规。"
          },
          {
            "h": "需要提前问清的事",
            "list": [
              "考场具体位置、需要提前多久到场（一般提前 30 分钟）",
              "是否允许自带键盘/鼠标（多数不允许）",
              "是否可以中途上厕所（一般可以，需监考陪同）",
              "交卷方式：是系统提交还是拷到指定目录"
            ]
          },
          {
            "h": "关于模板",
            "html": "很多人习惯背模板（快读、对拍脚本、常用算法）。但<b>纸质模板不能带进考场</b>。正确做法是把它背进脑子，或者开考后用编辑器快速敲出来。真正该记熟的是：快读、二分模板、sort 用法、freopen 写法——都是十几行内的东西。"
          }
        ]
      },
      {
        "id": "p3",
        "title": "考试流程与时间轴",
        "meta": "流程 · 每个阶段做什么",
        "blocks": [
          {
            "h": "入场与登录",
            "html": "提前 30 分钟到场，核对座位号，检查机器：能不能开机、键盘是否好用、屏幕是否正常。<b>发现问题立即举手换机</b>，等开考后再换就浪费时间了。登录后用你的准考证号/账号进入考试系统，确认能看到题目。"
          },
          {
            "h": "开考后前 20 分钟：通读全部题目",
            "html": "不要一上来就写第一题。花 20 分钟把四道题读完，做三件事：① 判断每题难度和考点；② 看每题的数据范围（决定复杂度）；③ 排一个作答顺序。这 20 分钟的投资回报率极高——它能避免你在最难那题上耗掉一小时。"
          },
          {
            "h": "作答阶段：每题 40~50 分钟",
            "html": "单题节奏建议：想清楚再动手（10 分钟）→ 写代码（20 分钟）→ 测样例和边界（10 分钟）→ 有余力再优化（10 分钟）。如果 30 分钟还没有清晰思路，<b>先写暴力拿部分分，然后跳到下一题</b>，最后再回来。"
          },
          {
            "h": "最后 20 分钟：检查与兜底",
            "html": "停止写新功能，专心做三件事：① 逐题确认代码已保存；② 逐题跑一遍样例，确认输出格式正确；③ 检查有没有残留的调试输出、有没有忘记注释的 freopen。这 20 分钟救回来的分数，往往比再挤出一道题更多。"
          },
          {
            "h": "交卷",
            "html": "按监考老师指示交卷。如果是系统提交，<b>提交后确认状态显示「已提交」</b>；如果是拷文件，确认文件名、目录正确。<br><b>千万不要在最后 1 分钟才开始交卷</b>——系统卡顿、网络拥堵都可能让你白考。"
          },
          {
            "h": "本模拟器的对应流程",
            "html": "学生端登录 → 进入 NOI Linux 桌面 → 双击题目 zip 看题面 → 打开编辑器写代码 → 用评测面板自测 → 点「提交试卷」交卷。倒计时结束会自动交卷并锁定，所以不要等到最后一秒。"
          }
        ]
      },
      {
        "id": "p4",
        "title": "代码提交规范",
        "meta": "规范 · 一个字符决定 0 分",
        "blocks": [
          {
            "h": "文件 IO 赛制的命名规则",
            "html": "传统赛制下，题目名就是文件名。比如题目叫 <code>apple</code>，你的源程序必须叫 <code>apple.cpp</code>，程序要从 <code>apple.in</code> 读、写到 <code>apple.out</code>。<b>大小写、拼写、扩展名错一个字符，就是 0 分</b>，评测机不会提示你「文件名可能写错了」。"
          },
          {
            "h": "一题一文件，不要混",
            "html": "四道题写四个独立文件：<code>a.cpp</code>、<code>b.cpp</code>、<code>c.cpp</code>、<code>d.cpp</code>。不要在一个文件里写多道题然后注释切换——时间紧的时候极容易交出错版本。也不要反复覆盖同一个文件，万一想回退就没有了。"
          },
          {
            "h": "保存！保存！保存！",
            "html": "这是最荒谬也最常见的爆零原因：代码写完了，没按 Ctrl+S，交卷时交的是空文件或半成品。养成习惯：<b>每写完一段就 Ctrl+S</b>。本模拟器的编辑器会自动保存草稿，但真实考场不一定有这功能。"
          },
          {
            "h": "提交前的三秒检查",
            "list": [
              "文件名对不对（大小写、拼写、.cpp）",
              "是不是最新版本（有没有存盘）",
              "freopen 有没有按赛制处理（该加的加，该注释的注释）",
              "有没有残留 <code>cout &lt;&lt; \"debug\" &lt;&lt; endl;</code> 这类调试输出"
            ]
          },
          {
            "h": "关于编译选项",
            "html": "有些赛区要求你在代码里不加任何特殊编译指令，评测机会统一用 <code>-O2 -std=c++14</code> 编译。所以：不要依赖 <code>#pragma GCC optimize</code> 之类的非标准写法（可能被忽略或报错），也不要使用 C++17 以上才有的语法（比如结构化绑定），否则直接 CE。"
          }
        ]
      },
      {
        "id": "p5",
        "title": "编译器与常见编译错误",
        "meta": "编译 · 快速定位 CE",
        "blocks": [
          {
            "h": "看报错的第一原则",
            "html": "编译器报错常常一次报几十条，但<b>只有第一条是真的</b>，后面都是连锁反应。永远先看最上面那条，以及它标注的行号。改完再编译，别一次改十处。"
          },
          {
            "h": "高频编译错误对照",
            "list": [
              "<b>expected ';' before ...</b>：上一行漏分号（尤其是 struct 定义结尾、类定义结尾）",
              "<b>'x' was not declared in this scope</b>：变量没定义、拼写错、或定义在用了之后",
              "<b>no matching function for call to ...</b>：参数类型/个数不对，常见于 sort 的 cmp 写错签名",
              "<b>invalid types 'int[int]' for array subscript</b>：把变量名和数组名搞混了",
              "<b>redefinition of ...</b>：同一个变量/函数定义了两次（常见于把 main 写了两遍）",
              "<b>cannot convert ... to ...</b>：类型不匹配，比如把字符串赋给 int"
            ]
          },
          {
            "h": "中文标点陷阱",
            "html": "这是中国选手最特有的 bug：写代码时输入法没切回英文，打出全角的 <code>；</code> <code>（</code> <code>）</code> <code>\"</code> <code>，</code>。编译器会报「stray '\\357' in program」这类看不懂的错误。<b>看到奇怪的乱码报错，第一反应就是检查标点是不是中文的。</b>"
          },
          {
            "h": "为什么本地能过、评测机 CE",
            "list": [
              "用了本地 g++ 支持但评测机版本不支持的语法（如 C++17 特性）",
              "用了 Windows 特有的头文件（<code>&lt;windows.h&gt;</code>、<code>&lt;conio.h&gt;</code>）",
              "用了 <code>bits/stdc++.h</code> 而评测机不支持（少数环境）",
              "文件保存成了 GBK 编码，Linux 下中文注释变乱码导致报错",
              "本地是 Windows 换行（CRLF），极少数环境对行尾敏感"
            ]
          },
          {
            "h": "编码问题怎么避免",
            "html": "<b>代码里不要写中文注释</b>——这是最省事的办法。如果一定要写，确保文件保存为 UTF-8 无 BOM。NOI Linux 默认 UTF-8，Windows 下编辑器默认可能是 GBK，跨平台就容易出乱码。"
          }
        ]
      },
      {
        "id": "p6",
        "title": "防止爆零的 10 条",
        "meta": "保命 · 逐条对照",
        "blocks": [
          {
            "h": "开考前逐条念一遍",
            "html": "这 10 条覆盖了绝大多数「明明会做却 0 分」的情况。它们不涉及任何算法，纯粹是流程纪律。"
          },
          {
            "h": "十条规定",
            "list": [
              "① <b>四题都读</b>，不要只看第一题就埋头写。",
              "② <b>每题都交</b>，哪怕只会输出样例，也不要留空文件。",
              "③ <b>先写暴力</b>，保证每题都有一版能跑的代码兜底。",
              "④ <b>数组开够</b>：按数据范围上限 + 5。",
              "⑤ <b>long long 别省</b>：求和、乘积、计数一律 long long。",
              "⑥ <b>多组数据要清空</b>：全局数组、计数器、标记数组全部重置。",
              "⑦ <b>测边界</b>：n=1、全相同、最大规模、负数。",
              "⑧ <b>删调试输出</b>：交卷前全局搜索 cout/cprintf。",
              "⑨ <b>确认保存</b>：每题最后一次 Ctrl+S，再扫一眼文件名。",
              "⑩ <b>提前交卷</b>：留 5 分钟余量，不要卡最后一秒。"
            ]
          },
          {
            "h": "为什么第 ② 条特别重要",
            "html": "评测是按测试点给分的。就算你的程序完全不会做，只要它能正确读入并输出一个合理答案，也可能蒙对 1~2 个测试点（尤其是样例点）。空文件一定是 0 分，而「随便交个东西」期望值是正数。<b>这是纯粹的数学优势。</b>"
          },
          {
            "h": "本模拟器里的对应检查",
            "html": "本模拟器倒计时结束会<b>自动交卷</b>，所以不存在「忘记交卷」的问题。但「忘记保存代码」仍然可能发生——编辑器会自动保存草稿，建议每次运行前手动确认一次。"
          }
        ]
      },
      {
        "id": "p7",
        "title": "遇到不会做的题",
        "meta": "策略 · 怎么榨出分",
        "blocks": [
          {
            "h": "先找部分分",
            "html": "CSP-S 的题目几乎都是「按数据范围分层给分」：小数据用暴力，大数据用正解。不会正解时，<b>认真读数据范围表格</b>，找出你能处理的那一档。比如「n ≤ 20 时答案可以状压枚举」，那你就写个枚举，稳拿 20~40 分。"
          },
          {
            "h": "特判也能拿分",
            "html": "有时候特殊数据（n=1、所有数相同、图是一条链）好处理，而它们单独占一个测试点。写几个特判分支，可能多拿 10 分。注意：特判要写在正解逻辑之前，且要确保不会误伤一般情况。"
          },
          {
            "h": "换个角度想问题",
            "html": "卡住时问自己三个问题：① <b>能不能反过来做</b>（正着难、倒着易，比如逆序对、倒推）；② <b>能不能先排序</b>（排序后往往能发现单调性）；③ <b>能不能降低维度</b>（二维难就试试一维，或者按某一维扫描）。"
          },
          {
            "h": "别死磕",
            "html": "一道题超过 <b>40 分钟</b>没有任何进展，就果断跳走。不是放弃，是「先拿到别的题的分，最后有余力再回来」。很多人全场卡在一道题上，最后四题总共 30 分——而按策略做，同样的能力能拿 150 分。"
          },
          {
            "h": "输出样例也是一种策略",
            "html": "如果实在没思路，至少保证程序能读入、能输出一个格式正确的答案。有些测试点是样例点，输出正确格式的答案可能蒙中。这听起来不体面，但在「0 分 vs 10 分」面前，体面不重要。"
          }
        ]
      },
      {
        "id": "p8",
        "title": "健康与心态",
        "meta": "心态 · 3.5 小时的马拉松",
        "blocks": [
          {
            "h": "节奏：不要一开始就冲刺",
            "html": "3.5 小时是马拉松不是短跑。前 30 分钟用力过猛会让人在中段脑力下降，而中段恰恰是拿分的关键期。保持均匀节奏，每 45 分钟起身活动一下（如果允许），喝口水。"
          },
          {
            "h": "心态：错了就改，不追悔",
            "html": "发现前面某题思路错了，不要陷入「我怎么这么蠢」的自我消耗。立刻评估：改要多久？值不值？能改就改，改不动就放弃，把时间给别的题。<b>考场上最贵的成本不是错误，是为错误懊悔的时间。</b>"
          },
          {
            "h": "紧张到大脑空白怎么办",
            "html": "这是很常见的生理反应。三个立刻见效的办法：① <b>深呼吸 4 秒吸、6 秒呼</b>，重复 5 次；② <b>从最简单的题开始</b>，用一次成功建立信心；③ <b>先去读题不写代码</b>，读题比写代码压力小，能帮你重新进入状态。"
          },
          {
            "h": "身体上的准备",
            "html": "考前别熬夜——一晚刷题换来考场上的迟钝，绝对亏。考试当天正常吃早饭，别吃太油腻。带一件外套，机房空调很冷；带水，但别喝太多（上厕所要监考陪同，浪费时间）。"
          },
          {
            "h": "考完之后",
            "html": "考完不要立刻和同学对答案，尤其不要因为某题做法不同就认定自己错了——你们可能都对，也可能都错。<b>成绩出来前的一切对答案都是自我折磨。</b>把精力放在复盘：哪些题该拿没拿到，下次怎么避免。这才是真正的进步来源。"
          }
        ]
      }
    ]
  },
  "ide": {
    "title": "IDE 使用指南",
    "icon": "🖥️",
    "intro": "这一板块讲清楚本模拟器的编辑器怎么用，以及它和真实 NOI Linux 环境的对应关系。编辑器运行的是一个教学用 C++ 子集解释器，所以能力强项和限制都与真实 g++ 不同——了解边界，能避免你「本地过了却不知道为什么这里报错」。左边 6 个主题，从界面到排错全覆盖。",
    "nodes": [
      {
        "id": "i1",
        "title": "编辑器界面",
        "meta": "界面 · 认识每个区域",
        "blocks": [
          {
            "h": "整体布局",
            "html": "打开「编辑器」后是一个标准三区布局：<b>左侧代码区</b>（带行号，自动语法高亮）、<b>右上输出区</b>（运行结果与报错）、<b>右下输入区</b>（stdin，程序读入的数据贴在这里）。底部是状态栏，显示运行状态、耗时、退出码等信息。"
          },
          {
            "h": "代码区：行号与高亮",
            "html": "左侧灰色数字是行号。编译报错会给出「第 N 行」，直接对着行号找即可。语法高亮把关键字、字符串、注释、数字用不同颜色区分，一眼能看出引号是否闭合、注释范围是否正确。<b>小技巧</b>：如果一大片代码都变成同一种颜色（比如全绿），说明引号或注释符号没闭合。"
          },
          {
            "h": "输入区（stdin）怎么用",
            "html": "这是最容易被忽略的区域。程序里的 <code>cin &gt;&gt; n</code> 读的就是这里贴进去的内容。如果程序运行后一直没输出，<b>第一反应就是检查输入区是不是空的</b>——程序正卡在等待读入。"
          },
          {
            "h": "输入区格式要求",
            "html": "按题目输入格式原样粘贴即可，数字之间空格或换行都行（cin 自动跳过空白）。但要注意：<code>cin &gt;&gt; s</code> 读字符串会在空白处停，如果要读带空格的一整行，得用 <code>getline</code>。"
          },
          {
            "h": "输入示例",
            "code": "// 若题目输入是：\n//   5\n//   1 2 3 4 5\n// 输入区就贴：\n5\n1 2 3 4 5"
          },
          {
            "h": "多文件与切换",
            "html": "编辑器支持在一个窗口内切换多道题的代码，方便你在不同题目间来回对照。每道题的代码会自动保存，关掉窗口再打开内容还在。<b>建议</b>：一题一文件，不要把所有题混写在一个文件里——这是真实考试的规范，也是好习惯。"
          },
          {
            "h": "状态栏信息",
            "html": "运行完成后留意状态栏：<b>✓ 运行完成</b>表示正常结束；<b>运行时错误</b>表示程序崩了（越界、除零、超时等）；返回码非 0 也可能暗示问题。状态栏还会显示耗时，帮你判断离时限还有多远。"
          }
        ]
      },
      {
        "id": "i2",
        "title": "编写与运行",
        "meta": "运行 · 从代码到结果",
        "blocks": [
          {
            "h": "运行程序的三种方式",
            "html": "① 点工具栏的 <b>编译并运行</b> 按钮；② 快捷键 <b>Ctrl+Enter</b>（最快，写代码时手不用离开键盘）；③ 用评测面板的「评测所有点」跑全部测试点。日常调试用 Ctrl+Enter，交卷前用评测面板跑全部点。"
          },
          {
            "h": "运行结果的四个区域",
            "html": "运行后信息分在四个标签里，各有用途：<b>编译信息</b>（语法错误与警告）、<b>虚拟汇编</b>（生成的 VM-32 指令，理解底层）、<b>执行统计</b>（语句执行次数，估算复杂度）、<b>CSP-S 评测</b>（跑测试点）。平时最常看的是编译信息和输出区。"
          },
          {
            "h": "看懂编译错误",
            "html": "错误信息一般给出「第几行 + 什么错」。本编辑器的报错已经做了中文说明，比原生 g++ 友好很多。要点：<b>只看第一条错误</b>，后面往往是连锁反应；改完重新运行再看。"
          },
          {
            "h": "常见错误对照",
            "list": [
              "<b>缺少分号</b>：报错行常常指向下一行，实际是上一行漏了 <code>;</code>",
              "<b>变量未定义</b>：拼写错了、或者定义在使用之后",
              "<b>括号不匹配</b>：大括号没闭合，检查函数和循环的花括号配对",
              "<b>数组下标越界</b>：不是编译错误，是运行时错误，程序会直接崩",
              "<b>中文字符</b>：中文标点、中文变量名都可能导致解析失败"
            ]
          },
          {
            "h": "为什么运行后没反应",
            "html": "三个原因，按概率排序：① <b>等输入</b>——输入区是空的，程序卡在 cin（最常见）；② <b>死循环</b>——循环变量没推进，程序在空转（会一直显示「运行中」）；③ <b>输出在缓冲里没刷出</b>——程序还在跑，跑完才统一显示。"
          },
          {
            "h": "运行超时",
            "html": "单次运行有墙钟时间上限（5 秒），超过会报「解释器运行超时」。评测模式下按测试点各自的时限判定（默认 1000ms）。如果你确定算法没问题却超时，先怀疑死循环——小数据也超时基本就是死循环。"
          },
          {
            "h": "关于调试输出",
            "html": "调试时用 <code>cout</code> 打印中间变量是最快的手段，但<b>交卷前一定要删掉</b>。残留的调试输出会直接导致答案错误（WA）。建议调试输出加个显眼标记，比如 <code>cout &lt;&lt; \"### \" &lt;&lt; x &lt;&lt; \"\\n\";</code>，交卷前搜一下 \"###\" 就能全部找到。"
          }
        ]
      },
      {
        "id": "i3",
        "title": "评测面板",
        "meta": "评测 · 本地自测",
        "blocks": [
          {
            "h": "评测面板是什么",
            "html": "切到 <b>CSP-S 评测</b> 标签，你会看到一列测试点和「评测所有点」按钮。点下去后，代码会对每个测试点分别运行，把输入喂进去、拿输出和标准答案比对，逐点给出结果。这完全模拟了真实评测的过程，也是你交卷前判断能拿多少分的唯一依据。"
          },
          {
            "h": "测试点列表怎么看",
            "html": "每题有 6 个测试点：<b>2 个样例点</b>（题面里给的那两组，用来验证理解对不对）和 <b>4 个隐藏点</b>（含边界、极限数据，用来卡算法复杂度）。每题各点等分，6 点全过就是满分。"
          },
          {
            "h": "结果含义",
            "list": [
              "<b>AC</b>（Accepted）：通过，输出与标准答案完全一致",
              "<b>WA</b>（Wrong Answer）：答案错，输出格式或数值不符",
              "<b>TLE</b>（Time Limit Exceeded）：超时，复杂度太高或有死循环",
              "<b>RE</b>（Runtime Error）：运行崩溃，多为数组越界、除零、栈溢出",
              "<b>—</b>（未运行）：还没点评测，或该点被跳过"
            ]
          },
          {
            "h": "样例过、隐藏点挂，说明什么",
            "html": "这是最典型的情况，含义很明确：<b>你的思路是对的，但扛不住大数据</b>。样例数据小，O(n²) 也能过；隐藏点里 n 到 10⁵，就必须 O(n log n) 甚至 O(n)。解法是回头看题目的数据范围，重新估复杂度。"
          },
          {
            "h": "时限怎么调",
            "html": "评测面板里可以调整每个测试点的时限（默认 1000ms，与 CSP-S 口径一致）。一般不要动。如果你在测试「某个写法到底有多慢」，可以临时调小观察，但<b>交卷前务必调回 1000ms</b>。"
          },
          {
            "h": "评测建议顺序",
            "html": "① 先用样例点确认题意理解正确；② 再跑全部点看能拿多少；③ 若隐藏点挂，先看是 WA 还是 TLE——WA 是逻辑问题，TLE 是性能问题；④ 改完再跑一遍，确认没有「修好一个挂掉另一个」。"
          },
          {
            "h": "评测 ≠ 最终成绩",
            "html": "本模拟器的评测在浏览器里跑，用的是同一个解释器，所以结果可信、但也受解释器限制（不支持 map/set/struct 等）。真实比赛用的是 g++ 编译的原生程序，同样的算法会快很多。<b>不要因为这里 TLE 就认为真实比赛也会 TLE</b>，但要因为这里 WA 而认真怀疑逻辑。"
          }
        ]
      },
      {
        "id": "i4",
        "title": "快捷键与效率",
        "meta": "效率 · 少用鼠标",
        "blocks": [
          {
            "h": "核心快捷键",
            "list": [
              "<b>Ctrl+Enter</b>：编译并运行（最常用，写代码时手不离键盘）",
              "<b>Ctrl+K</b>：代码补全，输入前几个字母后触发",
              "<b>Tab</b>：缩进（选中多行可整体缩进）",
              "<b>Ctrl+Z / Ctrl+Shift+Z</b>：撤回 / 重做（编辑器自己维护快照栈）",
              "<b>Ctrl+A / Ctrl+C / Ctrl+V</b>：全选、复制、粘贴"
            ]
          },
          {
            "h": "为什么要练快捷键",
            "html": "考试 3.5 小时，每次「移动鼠标 → 找按钮 → 点击」约 2 秒。如果你运行 100 次，就是 200 秒，超过 3 分钟——够你多测一组数据了。用 Ctrl+Enter，整个过程 0.2 秒。<b>效率是练出来的，不是天生的。</b>"
          },
          {
            "h": "缩进的价值",
            "html": "缩进不只是好看。缩进乱的代码，你会看不出 if/else 的配对关系、看不出循环到哪结束——这是大量「逻辑看起来对但结果不对」的根源。养成习惯：写完一个 <code>{ }</code> 立刻整理缩进，比事后调快得多。"
          },
          {
            "h": "代码模板",
            "html": "编辑器提供了一些起始模板（工具栏可切换），能省下手敲头文件、main 框架的时间。但注意：<b>模板只是脚手架</b>，该理解的结构还是要理解，否则改起来更慢。"
          },
          {
            "h": "关于复制粘贴",
            "html": "本模拟器默认允许复制粘贴（管理员可关闭），这和真实 CSP-S 不同——真实考试<b>禁止</b>使用任何外部资料。建议你按真实规则练习：不查资料、不粘贴现成代码，这样模拟才有意义。"
          }
        ]
      },
      {
        "id": "i5",
        "title": "与真实 NOI Linux 的对应",
        "meta": "对照 · 差异与边界",
        "blocks": [
          {
            "h": "设计目标",
            "html": "本模拟器的目标是让你提前熟悉「考试是什么形态」：桌面上有题目压缩包、要解压、要用编辑器写代码、要自己跑数据验证。这些流程和真实考试一致，练熟了到考场不会手足无措。"
          },
          {
            "h": "对应关系",
            "list": [
              "<b>桌面 + 题目 zip</b> ↔ 真实 NOI Linux 桌面上的题目文件夹",
              "<b>编辑器</b> ↔ Code::Blocks / Geany / vim 等编辑器",
              "<b>编译并运行</b> ↔ 命令行 <code>g++ -O2 ...</code> 后 <code>./a</code>",
              "<b>输入区 stdin</b> ↔ 命令行重定向 <code>./a &lt; a.in</code>",
              "<b>终端</b> ↔ 真实 Terminal（ls / cat / cd 等命令基本一致）",
              "<b>评测面板</b> ↔ 官方评测系统（本地可自测，真实考试无此功能）"
            ]
          },
          {
            "h": "关键差异：解释器 vs 编译器",
            "html": "这是<b>最重要的差异</b>，务必理解：本编辑器运行的是一个 C++ 子集解释器，逐条执行你的代码；真实环境是 g++ 编译成机器码后运行。后果：这里的运行速度比真实编译器慢很多（可能慢 10 倍以上），所以同样的算法这里 TLE、真实比赛可能 AC。"
          },
          {
            "h": "支持与不支持的语法",
            "list": [
              "✅ 支持：<code>int</code>/<code>long long</code>/<code>char</code>/<code>double</code>、数组、<code>vector&lt;int&gt;</code>、char 数组整串读入（<code>cin &gt;&gt; s</code>）、<code>strlen</code> / <code>strcmp</code> / <code>strcpy</code> / <code>strcat</code>",
              "✅ 支持：函数、递归、引用参数、<code>switch</code>、<code>break</code>/<code>continue</code>",
              "✅ 支持：<code>sort</code>、<code>min</code>/<code>max</code>/<code>abs</code>/<code>swap</code>、位运算",
              "⚠️ <code>std::string</code> 只支持部分用法，字符串题建议用 char 数组",
              "❌ 不支持：<code>map</code>/<code>set</code>/<code>queue</code>/<code>stack</code>/<code>priority_queue</code>",
              "❌ 不支持：<code>struct</code>/<code>class</code>、指针、引用变量、嵌套 vector",
              "⚠️ <code>long long</code> 超过 2⁵³ 会失真（正常比赛数据不会到这个量级）"
            ]
          },
          {
            "h": "遇到不支持怎么办",
            "html": "两条路：① <b>换等价写法</b>——把 <code>queue</code> 换成数组 + 双指针（见算法教学第 11 章），把 <code>struct</code> 换成平行数组；② <b>本地验证</b>——在真实 NOI Linux 或本机 g++ 上测试那段代码，理解对了再回模拟器写等价版本。"
          },
          {
            "h": "不要被工具限制住思路",
            "html": "模拟器的边界是<b>工具</b>的边界，不是<b>知识</b>的边界。你完全可以学 map/set/struct——它们在实际比赛中非常好用，只是在这个模拟器里跑不了。把模拟器当成「练流程、练思路、练调试」的场地，而不是学习的全部。"
          }
        ]
      },
      {
        "id": "i6",
        "title": "常见问题",
        "meta": "FAQ · 排错速查",
        "blocks": [
          {
            "h": "运行后没反应 / 一直转圈",
            "html": "<b>原因</b>：程序在等输入（输入区为空），或者进了死循环。<br><b>排查</b>：先检查输入区是否贴了数据；填了还不行，就看是不是循环变量没推进。<br><b>快速验证</b>：在循环里加一句输出，看它是否在刷——如果疯狂刷屏，就是死循环。"
          },
          {
            "h": "样例过了，隐藏点全挂",
            "html": "<b>原因</b>：算法复杂度不够，或没处理边界。<br><b>排查</b>：看题目数据范围，算出你的复杂度能否扛住；再检查特殊数据（n=1、全相同、最大值）是否会崩。<br><b>典型</b>：样例 n=5 用 O(n²) 没问题，隐藏点 n=10⁵ 就必然 TLE。"
          },
          {
            "h": "为什么某点 TLE",
            "html": "<b>三种可能</b>：① 复杂度真的超了；② 死循环；③ 常数太大（比如在循环里反复调用 strlen）。<br><b>判断</b>：小数据也 TLE → 死循环；只有大数据 TLE → 复杂度问题。<br><b>注意</b>：这里是解释器，比真实编译器慢很多，边界情况下 TLE 不代表算法错。"
          },
          {
            "h": "代码丢了怎么办",
            "html": "本模拟器会自动保存草稿（关窗口、切题目都不会丢），重新打开编辑器即可恢复。但如果<b>交卷后</b>才想改，就无法恢复了——交卷是不可逆操作。真实考试的编辑器很多没有自动保存，<b>务必养成随手 Ctrl+S 的习惯</b>。"
          },
          {
            "h": "报错说「不支持」某个语法",
            "html": "说明你用到了解释器没实现的特性。对照上一节的支持列表，换成等价写法即可。最常见的是用了 <code>map</code>/<code>set</code>/<code>queue</code>/<code>struct</code>。这些都很好用，只是这个模拟器跑不了——真实比赛完全可以用。"
          },
          {
            "h": "输出和预期差一点（多空格/少换行）",
            "html": "评测是<b>逐字符比对</b>的，多一个空格、少一个换行都算 WA。常见原因：循环里每个数后面都输出空格（最后一个数后面多了一个）；最后没有换行。<b>技巧</b>：用 <code>cout &lt;&lt; a[i] &lt;&lt; \" \\n\"[i == n];</code> 这种写法控制分隔符。"
          },
          {
            "h": "实在找不到问题怎么办",
            "html": "按这个顺序来：① 把数据缩到最小（n=1、n=2），手算答案对比；② 在关键位置加 <code>cout</code> 打印中间变量，看从哪一步开始偏；③ 注释掉后半段代码，确认前半段结果对不对；④ 去复习端看对应题目的「易错点」，通常你踩的坑别人也踩过。"
          }
        ]
      }
    ]
  }
};
