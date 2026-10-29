/* 复习端 · 通用板块数据 —— 随仓库发布，由 review.js 读取
 * window.REVIEW_SECTIONS[sectionId] = { title, icon, intro, nodes:[ {id,title,meta,blocks:[{h,html?,list?,code?}]} ] }
 * 渲染规则：blocks 中 list 渲染为 <ul>，code 渲染为 <pre>，否则 html 作为内容。
 * 板块：methods 方法与技巧 / algo 算法教学 / preexam 考前注意事项 / ide IDE 指南
 */
window.REVIEW_SECTIONS = {

  methods: {
    title: '方法与技巧',
    icon: '🛠️',
    intro: '这部分不讲具体题目，而是讲「竞赛里反复用到的基本功」：怎么读得快、怎么估复杂度、怎么对拍验证、有哪些通用套路。' +
           '这些是非题本身但决定你能不能稳定拿分的底层能力。',
    nodes: [
      {
        id: 'io', title: '输入输出与快读', meta: '基础',
        blocks: [
          { h: '为什么要用快读', html: 'CSP 数据量常常很大（n 到 10⁶ 甚至更大），用 <code>cin/cout</code> 默认会做同步导致很慢。' +
            '而且 <code>cin</code> 默认和 <code>stdio</code> 同步，不关同步会慢几倍。' },
          { h: 'cin/cout 加速（最简单）', code:
            '#include <iostream>\n' +
            'using namespace std;\n' +
            'int main(){\n' +
            '  ios::sync_with_stdio(false);\n' +
            '  cin.tie(0);\n' +
            '  int n; cin >> n;\n' +
            '  return 0;\n' +
            '}' },
          { h: 'scanf / printf', html: '如果还不放心，用 <code>scanf/printf</code> 也很快，注意 <code>long long</code> 用 <code>%lld</code>。' +
            '用 <code>cout</code> 输出小数时记得 <code>fixed << setprecision(k)</code> 控制精度。' },
          { h: 'fread 快读（极限情况）', code:
            'char buf[1<<20], *p = buf;\n' +
            'inline int read(){\n' +
            '  int x = 0, f = 1; while (*p < 48 || *p > 57) { if (*p == 45) f = -1; p++; }\n' +
            '  while (*p >= 48 && *p <= 57) { x = x * 10 + (*p - 48); p++; }\n' +
            '  return x * f;\n' +
            '}\n' +
            '// 主函数开头 fread(buf, 1, sizeof(buf), stdin);' }
        ]
      },
      {
        id: 'complexity', title: '复杂度估算', meta: '基础',
        blocks: [
          { h: '时间复杂度', html: '衡量「数据规模 n 翻倍，运行时间大约翻几倍」。常见：O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ)。' +
            '比赛时限一般按 1 秒约 10⁷~10⁸ 次运算估算，超了就可能 TLE。' },
          { h: '空间复杂度', html: '数组开多大。1e8 个 int 约 400MB 会 MLE，通常 1e6~1e7 量级安全。注意全局数组在静态区，别开在函数里爆栈。' },
          { h: '常见量级对照', list: [
            'n ≤ 20：可以枚举/搜索/状压（2ⁿ）。',
            'n ≤ 5000：O(n²) DP 可行。',
            'n ≤ 10⁵：需 O(n) 或 O(n log n)（排序、二分、线段树、并查集）。',
            'n ≤ 10⁶：基本只能是 O(n) 线性扫描。'
          ] },
          { h: '怎么判断会不会 TLE', html: '先看数据范围，反推允许的复杂度，再决定算法。拿不准就用「最大数据 + 本地计时」实测一下，比空想靠谱。' }
        ]
      },
      {
        id: 'duipai', title: '对拍与暴力验证', meta: '调试',
        blocks: [
          { h: '什么是对拍', html: '你写了一个高效但可能错的程序 A，再写一个「保证对但很慢」的暴力 B，用随机数据生成器 C 造数据，' +
            '把 A 和 B 的输出逐字节比对，不一致就说明 A 有 bug，且你能立刻拿到反例。' },
          { h: '随机数据生成器', code:
            '#include <cstdio>\n#include <cstdlib>\n#include <ctime>\n' +
            'int main(){ srand(time(0)); int n = rand() % 10 + 1; printf("%d\\n", n);\n' +
            '  for (int i=0;i<n;i++) printf("%d %d\\n", rand()%100, rand()%100); return 0; }' },
          { h: '比对思路', html: '用批处理/脚本循环：生成数据 → 分别跑 A、B → diff 输出 → 发现不同立刻停。' +
            '对拍是 CSP 现场「救分」的利器，尤其在题意理解不确定时。' }
        ]
      },
      {
        id: 'binary', title: '二分答案套路', meta: '套路',
        blocks: [
          { h: '二分查找', html: '在有序区间里找某个值/边界，O(log n)。记住标准库 <code>lower_bound</code>（第一个 ≥ x）和 <code>upper_bound</code>（第一个 > x）。' },
          { h: '二分答案', html: '当「答案越大越容易满足条件」时，把「求最小/最大满足条件的答案」转化为：' +
            '在答案区间上二分，每次用 check(mid) 判断 mid 是否可行。典型题：最小的最大、最大的最小、砍树、分巧克力。' },
          { h: '单调性是关键', html: '只有当 check 关于答案是单调的（可行/不可行是一条分界线）时才能二分。先确认单调性再写。' }
        ]
      },
      {
        id: 'prefix', title: '前缀和与差分', meta: '套路',
        blocks: [
          { h: '前缀和', html: '<code>s[i] = s[i-1] + a[i]</code>，则区间和 <code>a[l..r] = s[r] - s[l-1]</code>，O(1) 查询，O(n) 预处理。二维同理。' },
          { h: '差分', html: '对区间 [l,r] 整体 +c，只需 <code>d[l]+=c, d[r+1]-=c</code>，最后前缀和恢复。O(1) 修改，常用于「多次区间加、最后求数组」。' },
          { h: '何时用', list: [
            '求很多区间和 → 前缀和。',
            '很多次区间加、最后看每个位置 → 差分。',
            '两者常配合：树状数组/线段树是它们的动态版本。'
          ] }
        ]
      },
      {
        id: 'discretize', title: '离散化', meta: '套路',
        blocks: [
          { h: '为什么离散化', html: '坐标或数值很大（如 10⁹）但个数很少（如 10⁵），把它们「排序后映射到 1..m」就能用数组下标操作。' },
          { h: '做法', code:
            '// a[] 为原始值\n' +
            'vector<int> b(a, a+n); sort(b.begin(), b.end());\n' +
            'b.erase(unique(b.begin(), b.end()), b.end());\n' +
            'int m = b.size();\n' +
            '// x 映射为：lower_bound(b.begin(), b.end(), x) - b.begin() + 1' }
        ]
      },
      {
        id: 'debug', title: '调试与 RE/TLE/MLE 排查', meta: '调试',
        blocks: [
          { h: '错误类型对照', list: [
            'RE（运行错误）：数组越界、除零、栈溢出（递归太深）、 vector 下标为负。',
            'TLE（超时）：复杂度不对、死循环、输入没加快读。',
            'MLE（超内存）：数组开太大、递归没记忆化。',
            'WA（答案错）：题意理解、初始化、边界、long long 溢出。'
          ] },
          { h: '调试技巧', list: [
            '先拿样例和小数据手算，对照程序输出。',
            '把中间变量打印出来，定位哪一步开始不对。',
            '怀疑溢出就全局搜一遍会不会超 int。',
            '本地把数据范围调到最小，方便肉眼看。'
          ] }
        ]
      },
      {
        id: 'strategy', title: '考场策略', meta: '心态',
        blocks: [
          { h: '时间分配', html: 'CSP-S 通常 4 道/5 道，总时间 3.5~4 小时。建议：前 30 分钟通读全部题面，先写最有把握的题。' },
          { h: '先易后难', html: '第一题往往送分，先拿稳；难题卡 30 分钟没思路就先放，回头再想，别在一棵树上吊死。' },
          { h: '交卷前检查清单', list: [
            '文件名、目录结构符合要求。',
            '数组大小是否够、会不会越界。',
            '所有变量是否初始化。',
            '会不会溢出（long long）。',
            '多测是否清空了全局数组。',
            '输出格式（空格、换行）是否和样例一致。'
          ] }
        ]
      }
    ]
  },

  algo: {
    title: '算法教学',
    icon: '📚',
    intro: '本板块按「由语法到算法」的顺序组织，参考信息学奥赛教材的章节结构。' +
           'NOI 最终考察的是用算法解决实际问题的能力，但语法是地基——先把地基打牢，再往上盖楼。左边是章节，右边是每章要点。',
    nodes: [
      {
        id: 'c1', title: '第一章 · 基础语法', meta: '语法',
        blocks: [
          { h: '程序骨架', html: '一个 C++ 程序从 <code>int main(){ ... return 0; }</code> 开始，<code>#include &lt;iostream&gt;</code> 引入输入输出，' +
            '<code>using namespace std;</code> 省去 std:: 前缀。' },
          { h: '变量与类型', list: [
            '整数：<code>int</code>（约 ±21 亿）、<code>long long</code>（更大，约 ±9×10¹⁸，末尾加 LL 或 %lld 读入）。',
            '实数：<code>double</code>，输出用 <code>fixed &lt;&lt; setprecision(k)</code>。',
            '字符：<code>char</code>（单引号 \'a\'）；布尔：<code>bool</code>。',
            '常量：<code>const int N = 1e5+5;</code>'
          ] },
          { h: '运算符', html: '算术 <code>+ - * / %</code>（% 是取模，负数取模结果依编译器，注意防爆）；' +
            '关系 <code>== != &lt; &gt;</code>；逻辑 <code>&& || !</code>；自增 <code>i++ / ++i</code>。' },
          { h: '头文件速记', list: [
            '<code>&lt;iostream&gt;</code> 输入输出',
            '<code>&lt;cstdio&gt;</code> scanf/printf',
            '<code>&lt;algorithm&gt;</code> sort/lower_bound',
            '<code>&lt;vector&gt; &lt;string&gt;</code> 容器',
            '<code>&lt;cmath&gt;</code> 数学函数'
          ] }
        ]
      },
      {
        id: 'c2', title: '第二章 · 顺序与输入输出', meta: '语法',
        blocks: [
          { h: '顺序执行', html: '语句从上到下依次执行。最常见的就是「读入 → 计算 → 输出」。' },
          { h: '输出细节', code:
            'cout << "ans=" << x << "\\n";   // 换行用 \\n 最快\n' +
            'printf("%d %lld\\n", a, b);      // long long 用 %lld' },
          { h: '精度控制', html: '输出 k 位小数：<code>cout &lt;&lt; fixed &lt;&lt; setprecision(k) &lt;&lt; x;</code>（需 <code>&lt;iomanip&gt;</code>）。' }
        ]
      },
      {
        id: 'c3', title: '第三章 · 选择语句', meta: '语法',
        blocks: [
          { h: 'if / else', code:
            'if (x > 0) cout << "正";\n' +
            'else if (x < 0) cout << "负";\n' +
            'else cout << "零";' },
          { h: '逻辑运算', html: '<code>&&</code>(与) <code>||</code>(或) <code>!</code>(非)。注意短路：<code>a && b</code> 若 a 为假不再算 b。' },
          { h: 'switch', html: '多分支等值判断用 <code>switch(case 值)</code>，每个分支记得 <code>break</code>，否则会穿透。' }
        ]
      },
      {
        id: 'c4', title: '第四章 · 循环语句', meta: '语法',
        blocks: [
          { h: 'for / while', code:
            'for (int i = 1; i <= n; i++) sum += i;   // 计数循环\n' +
            'while (x > 0) { x /= 2; }                // 条件循环' },
          { h: '嵌套循环', html: '二维问题常用两层循环枚举行和列。注意内层变量名不要和外层冲突。' },
          { h: 'break / continue', list: [
            '<code>break</code>：立刻跳出整个循环。',
            '<code>continue</code>：跳过本次剩余，进入下一轮。',
            '死循环常因条件永远为真，调试时先确认循环变量在变。'
          ] }
        ]
      },
      {
        id: 'c5', title: '第五章 · 数组', meta: '语法',
        blocks: [
          { h: '一维数组', html: '<code>int a[1005];</code> 下标从 0 到 1004。常开大一点（如 <code>N=1e5+5</code>）防越界。' },
          { h: '二维数组', html: '<code>int g[1005][1005];</code> 表示矩阵或邻接矩阵。遍历 <code>for i for j</code>。' },
          { h: '经典应用', list: [
            '前缀和：<code>s[i]=s[i-1]+a[i]</code>。',
            '计数/桶：用数组下标做哈希统计。',
            '打表：预处理答案存数组。'
          ] },
          { h: '越界是头号杀手', html: '下标写成 <code>a[n]</code>（越界到 a[n-1] 之后）是 RE 最常见原因。循环写好边界。' }
        ]
      },
      {
        id: 'c6', title: '第六章 · 函数与递归', meta: '语法',
        blocks: [
          { h: '函数定义', code:
            'int add(int a, int b){ return a + b; }   // 值传递\n' +
            'void f(int &x){ x++; }                  // 引用传递，能改原值' },
          { h: '递归', html: '函数调用自己，必须有「边界条件」否则无限递归爆栈。阶乘、斐波那契、DFS 都是递归。' },
          { h: '引用 &', html: '参数加 <code>&</code> 是引用，函数内修改会影响外面；常用于避免拷贝大对象或在函数里返回多个结果。' }
        ]
      },
      {
        id: 'c7', title: '第七章 · 字符串', meta: '语法',
        blocks: [
          { h: '字符数组', code:
            'char s[105];\n' +
            'cin >> s;            // 读到空格/换行停止\n' +
            'int len = strlen(s); // 长度（需 <cstring>）' },
          { h: 'string 类', html: '<code>string s; cin >> s;</code> 更方便：<code>s.size()</code> 长度，<code>s[i]</code> 取字符，<code>s += "x"</code> 拼接，<code>s.substr(p,len)</code> 截取。' },
          { h: '遍历', code: 'for (char c : s) cout << c;   // 范围 for' }
        ]
      },
      {
        id: 'c8', title: '第八章 · 结构体', meta: '语法',
        blocks: [
          { h: 'struct 定义', code:
            'struct Node { int x, y; };\n' +
            'Node a[1005];\n' +
            'a[0].x = 3;' },
          { h: '排序与 cmp', code:
            'bool cmp(Node a, Node b){ return a.x < b.x; }   // 按 x 升序\n' +
            'sort(a, a + n, cmp);' },
          { h: '用途', html: '把「一组相关的数据」捆在一起，排序时整体移动，非常适合「多关键字记录」类题目。' }
        ]
      },
      {
        id: 'c9', title: '第九章 · 指针基础', meta: '语法',
        blocks: [
          { h: '地址与指针', html: '<code>int *p = &x;</code> 表示 p 存 x 的地址，<code>*p</code> 是 x 的值。竞赛里指针用得不如引用多，但理解地址有助于看懂数组。' },
          { h: '数组与指针', html: '数组名本身就是首元素地址，<code>a[i]</code> 等价于 <code>*(a+i)</code>。二维数组在内存里按行连续存放。' },
          { h: '何时用到', html: '链表的 next 指针、树用数组模拟时父/子关系。多数基础题用数组下标代替指针即可。' }
        ]
      },
      {
        id: 'c10', title: '第十章 · 文件操作', meta: '语法',
        blocks: [
          { h: 'freopen', code:
            'freopen("data.in", "r", stdin);\n' +
            'freopen("data.out", "w", stdout);\n' +
            '// 之后 cin/cout 就从文件读写' },
          { h: '考场用法', html: 'NOI 系列考试常用 freopen 从指定文件读、向指定文件写。注意文件名和题目一致，且赛后要去掉或注释掉调试用的绝对路径。' }
        ]
      },
      {
        id: 'c11', title: '第十一章 · STL 标准模板库', meta: '语法',
        blocks: [
          { h: '常用容器', list: [
            '<code>vector&lt;int&gt;</code>：可变长数组，<code>push_back</code> 尾部加，<code>size()</code> 长度。',
            '<code>stack&lt;int&gt;</code>：栈，<code>push/pop/top</code>。',
            '<code>queue&lt;int&gt;</code>：队列，<code>push/pop/front</code>。',
            '<code>map/set</code>：红黑树，自动有序；<code>unordered_map/set</code> 哈希，更快。',
            '<code>priority_queue&lt;int&gt;</code>：默认大根堆，小根堆用 <code>greater&lt;int&gt;</code>。'
          ] },
          { h: 'sort', code:
            'sort(a, a + n);                         // 默认升序\n' +
            'sort(v.begin(), v.end(), greater<int>()); // 降序\n' +
            'sort(a, a + n, [](int x, int y){ return x > y; }); // lambda' },
          { h: '小贴士', html: 'STL 很香，但要会算复杂度：map/set 单次操作 O(log n)，vector 尾部 O(1)、中间插入 O(n)。' }
        ]
      }
    ]
  },

  preexam: {
    title: '考前注意事项',
    icon: '⚠️',
    intro: '这一板块把「进了考场之后该做什么、别踩哪些坑」一次讲清。它不直接考算法，但每年都有人因为忽略这些而爆零。',
    nodes: [
      {
        id: 'env', title: '考试环境与 NOI Linux', meta: '环境',
        blocks: [
          { h: '真实环境长什么样', html: '复赛在 NOI Linux（Ubuntu 定制版）下进行，桌面有题目压缩包、IDE（如 Dev-C++ / VSCode）、终端。' +
            '本模拟器的「学生端」就是仿照它做的：桌面有题目的 .zip、双击解压、在 IDE 里写代码。' },
          { h: '编译器', html: '通常是 g++，编译命令类似 <code>g++ -o prog prog.cpp -O2</code>。注意开启 -O2 优化与不加优化时行为应一致。' },
          { h: '提前熟悉', html: '考试前至少在自己机器上把 Dev-C++/VSCode 跑通一遍，别考场上才第一次用。' }
        ]
      },
      {
        id: 'items', title: '携带物品与证件', meta: '准备',
        blocks: [
          { h: '必带', list: [
            '准考证、身份证（或考试规定的证件）。',
            '笔（打草稿、记思路）。',
            '如果允许，U 盘/草稿纸按考场规定。'
          ] },
          { h: '不要带', html: '手机、智能手表等电子设备通常禁止带入座位，按要求存放。' }
        ]
      },
      {
        id: 'flow', title: '考试流程与时间轴', meta: '流程',
        blocks: [
          { h: '入场与登录', html: '按指引登录考试系统，确认考生信息、考试科目正确。' },
          { h: '读题', html: '前 30 分钟建议通读所有题面，确定难度梯度，规划做题顺序。' },
          { h: '作答', html: '每题在 IDE 里建对应文件，先写能拿部分分的暴力/样例，再优化。' },
          { h: '交卷', html: '注意系统自动收卷时间，提前 10 分钟检查保存，不要卡最后一秒。' }
        ]
      },
      {
        id: 'submit', title: '代码提交规范', meta: '规范',
        blocks: [
          { h: '文件名与目录', html: '题目通常规定源文件名（如 <code>problem1.cpp</code>）和放置目录，务必完全一致，否则评测系统找不到文件 = 0 分。' },
          { h: '一题一文件', html: '不要把多题写在一个文件里，也不要写错扩展名（.cpp / .c）。' },
          { h: '保存', html: '本模拟器里代码保存在 IDE 中，交卷前确认已保存；真实考试同理，关 IDE 前先存盘。' }
        ]
      },
      {
        id: 'compile', title: '编译器与常见编译错误', meta: '编译',
        blocks: [
          { h: '常见报错', list: [
            '<code>error: expected ...</code>：少分号、少括号、中文标点。',
            '<code>undefined reference</code>：函数只声明没定义，或拼错名。',
            '<code>warning: comparison ... signed/unsigned</code>：有符号无符号混用，多注意。',
            '<code>error: array bound</code>：数组大小非编译期常量（用 const 定义）。'
          ] },
          { h: '中文标点陷阱', html: '写代码时切换输入法最容易打出中文分号、中文引号，编译器看不懂，逐字符检查。' }
        ]
      },
      {
        id: 'avoid', title: '防止爆零的 10 条', meta: '保命',
        blocks: [
          { h: '检查清单', list: [
            '1. 文件名/目录与题目要求完全一致。',
            '2. 所有数组开够、用 const 定义大小。',
            '3. 多测时全局数组每次清空（memset / 重新初始化）。',
            '4. 可能溢出的量用 long long。',
            '5. 所有变量先初始化再使用。',
            '6. 二分边界写对（l<=r 还是 l<r）。',
            '7. 输出格式与样例逐字符一致（空格、换行）。',
            '8. 主函数返回 0，不要漏 return。',
            '9. 不开 O2 和优化开关行为不一致的代码。',
            '10. 交卷前跑一遍样例，确认输出正确。'
          ] }
        ]
      },
      {
        id: 'stuck', title: '遇到不会做的题', meta: '策略',
        blocks: [
          { h: '先拿部分分', html: '大多数题有「部分分」：小数据可以暴力、特殊性质可以特判。先写能拿的分，再想满分。' },
          { h: '换个角度', html: '正向难就逆向、求最值就二分答案、看不出规律就先打个表找规律。' },
          { h: '别死磕', html: '一道题卡超过 30~40 分钟没进展，先去做别的，回来常常有灵感。' }
        ]
      },
      {
        id: 'health', title: '健康与心态', meta: '心态',
        blocks: [
          { h: '节奏', html: '中场适当休息眼睛，别一直盯屏幕。水和小零食按规定准备。' },
          { h: '心态', html: '遇到难题大家都难，稳住按计划做。已经写对的题不要反复改到改错。' },
          { h: '收尾', html: '最后 10 分钟只做「检查与保存」，不再大改结构，避免引入新 bug。' }
        ]
      }
    ]
  },

  ide: {
    title: 'IDE 使用指南',
    icon: '🖥️',
    intro: '本模拟器的「编辑器」仿照复赛 IDE：左边写代码、点运行看结果、评测面板跑测试点。这板块讲清楚每个功能怎么用。',
    nodes: [
      {
        id: 'ui', title: '编辑器界面', meta: '界面',
        blocks: [
          { h: '布局', html: '上方是工具栏（运行、评测等），中间是代码编辑区（带行号与语法高亮），下方是评测/输出区。' },
          { h: '行号与高亮', html: '行号方便定位报错；语法高亮让关键字、字符串、注释颜色不同，便于发现写错的地方。' },
          { h: '多文件', html: '每道题目在桌面有独立入口，点开即在编辑器载入该题代码区。' }
        ]
      },
      {
        id: 'run', title: '编写与运行', meta: '运行',
        blocks: [
          { h: '运行程序', html: '写好代码后点「运行」（或快捷键），编辑器会编译并执行，下方显示标准输出。' },
          { h: '看报错', html: '编译错误会显示在输出区，按行号回去改。运行时崩溃（RE）也会提示。' },
          { h: '输入', html: '需要输入的程序，在弹出的输入框或用样例输入测试，确认逻辑正确再提交评测。' }
        ]
      },
      {
        id: 'judge', title: '评测面板', meta: '评测',
        blocks: [
          { h: '测试点列表', html: '每题有若干测试点（样例 + 隐藏点）。评测面板逐一运行，显示通过/未通过。' },
          { h: '结果含义', list: [
            'AC：答案正确，得满分。',
            'WA：答案错误，对照样例和你的手算。',
            'TLE：超时，优化复杂度或检查死循环。',
            'RE：运行错误，查越界/除零/栈溢出。',
            'MLE：超内存，缩小数组。'
          ] },
          { h: '调试建议', html: '先在「运行」里用样例手动验证，再点评测批量跑。某点 WA 就拿它的输入单独测。' }
        ]
      },
      {
        id: 'shortcut', title: '快捷键与效率', meta: '效率',
        blocks: [
          { h: '常用操作', list: [
            'Ctrl/Cmd + S：保存（真实考试尤其重要）。',
            'Ctrl/Cmd + /：注释/取消注释选中行。',
            'Ctrl/Cmd + Z / Y：撤销 / 重做。',
            '选中后 Tab / Shift+Tab：整体缩进 / 反缩进。'
          ] },
          { h: '格式化', html: '保持缩进一致，不仅好看，也能让括号配对一目了然，减少低级错误。' }
        ]
      },
      {
        id: 'vsnoi', title: '与真实 NOI Linux 的对应', meta: '对照',
        blocks: [
          { h: '对应关系', list: [
            '桌面「题目 .zip」→ 真实考试发的题目压缩包。',
            '编辑器运行 → 在终端 g++ 编译运行。',
            '评测面板 → 考场评测系统（测点与得分）。',
            '任务栏时间 → 考试倒计时。'
          ] },
          { h: '差异说明', html: '本模拟器为网页环境，用 JS 解释执行 C++ 子集，速度不如本机 g++；复杂度为 O(n²) 的大数据在模拟器里可能偏慢，属正常现象。' }
        ]
      },
      {
        id: 'faq', title: '常见问题', meta: 'FAQ',
        blocks: [
          { h: '为什么运行没反应', html: '检查有没有死循环或没加输入；网页版需允许弹窗/新标签来打开独立编辑器。' },
          { h: '为什么某点 TLE', html: '模拟器跑大测试点比本机慢，可先确认算法复杂度正确；本题在真实评测同样可能 TLE，需优化。' },
          { h: '代码丢了怎么办', html: '本模拟器代码存在浏览器本地；真实考试务必养成随手 Ctrl+S 的习惯。' }
        ]
      }
    ]
  }
};
