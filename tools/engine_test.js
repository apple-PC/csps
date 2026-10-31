#!/usr/bin/env node
/* C++ 引擎回归测试：跑真实竞赛题型的代码，确认解析 / 语义 / STL 都正确
   用法：node tools/engine_test.js [过滤关键字] */
'use strict';
const path = require('path');
require(path.resolve(__dirname, '..', 'cpp-engine.js'));
const E = globalThis.CppEngine;

if (!E) {
  console.error('cpp-engine.js 未正确加载');
  process.exit(1);
}

/* 用例格式：[名称, 源码, 输入, 期望输出] */
const CASES = [
  ['A+B scanf', `#include <bits/stdc++.h>
using namespace std;
int main(){ int a,b; scanf("%d%d",&a,&b); printf("%d\\n",a+b); return 0; }`, '3 4\n', '7'],

  ['A+B cin', `#include <iostream>
using namespace std;
int main(){ int a,b; cin>>a>>b; cout<<a+b<<endl; return 0; }`, '3 4\n', '7'],

  ['注释后 include', `/* 说明 */#include <bits/stdc++.h>
using namespace std;
int main(){ cout<<1<<endl; return 0; }`, '', '1'],

  ['define 常量', `#include <bits/stdc++.h>
#define N 5
#define MOD 1000000007
using namespace std;
int a[N];
int main(){ a[0]=1; cout<<a[0]<<" "<<N<<" "<<MOD%7<<endl; return 0; }`, '', '1 5 6'],

  ['sort+vector', `#include <bits/stdc++.h>
using namespace std;
int main(){ vector<int> v; int n; cin>>n; for(int i=0;i<n;i++){int x;cin>>x;v.push_back(x);} sort(v.begin(),v.end()); for(int i=0;i<n;i++) cout<<v[i]<<" "; return 0; }`, '5\n5 3 9 1 7\n', '1 3 5 7 9'],

  ['sort 数组', `#include <bits/stdc++.h>
using namespace std;
int a[100005];
int main(){ int n; scanf("%d",&n); for(int i=0;i<n;i++) scanf("%d",&a[i]); sort(a,a+n); for(int i=0;i<n;i++) printf("%d ",a[i]); return 0; }`, '4\n4 2 3 1\n', '1 2 3 4'],

  ['pair+sort cmp', `#include <bits/stdc++.h>
using namespace std;
bool cmp(pair<int,int> a, pair<int,int> b){ return a.first<b.first; }
int main(){ vector<pair<int,int>> v; v.push_back(make_pair(2,1)); v.push_back(make_pair(1,2)); sort(v.begin(),v.end(),cmp); cout<<v[0].first<<" "<<v[0].second<<endl; return 0; }`, '', '1 2'],

  ['struct', `#include <bits/stdc++.h>
using namespace std;
struct Node{ int x, y; };
int main(){ Node a; a.x=3; a.y=4; cout<<a.x+a.y<<endl; return 0; }`, '', '7'],

  ['struct 运算符重载', `#include <bits/stdc++.h>
using namespace std;
struct P{ int x; bool operator<(const P& o) const { return x<o.x; } };
int main(){ vector<P> v; P a; a.x=3; P b; b.x=1; v.push_back(a); v.push_back(b); sort(v.begin(),v.end()); cout<<v[0].x<<v[1].x<<endl; return 0; }`, '', '13'],

  ['priority_queue', `#include <bits/stdc++.h>
using namespace std;
int main(){ priority_queue<int> q; q.push(3); q.push(9); q.push(1); cout<<q.top()<<endl; q.pop(); cout<<q.top()<<endl; return 0; }`, '', '9\n3'],

  ['pq greater', `#include <bits/stdc++.h>
using namespace std;
int main(){ priority_queue<int,vector<int>,greater<int>> q; q.push(3); q.push(9); q.push(1); cout<<q.top()<<endl; return 0; }`, '', '1'],

  ['map', `#include <bits/stdc++.h>
using namespace std;
int main(){ map<string,int> m; m["a"]=1; m["b"]=2; cout<<m["a"]+m["b"]<<endl; cout<<m.size()<<endl; return 0; }`, '', '3\n2'],

  ['map 遍历', `#include <bits/stdc++.h>
using namespace std;
int main(){ map<int,int> m; m[3]=1; m[1]=2; m[2]=3; for(auto p: m) cout<<p.first<<":"<<p.second<<" "; return 0; }`, '', '1:2 2:3 3:1'],

  ['map 迭代器', `#include <bits/stdc++.h>
using namespace std;
int main(){ map<string,int> m; m["x"]=7; map<string,int>::iterator it=m.find("x"); if(it!=m.end()) cout<<it->second<<endl; cout<<m.count("y")<<endl; return 0; }`, '', '7\n0'],

  ['set', `#include <bits/stdc++.h>
using namespace std;
int main(){ set<int> s; s.insert(3); s.insert(1); s.insert(3); cout<<s.size()<<endl; for(auto x: s) cout<<x; return 0; }`, '', '2\n13'],

  ['set<pair>', `#include <bits/stdc++.h>
using namespace std;
int main(){ set<pair<int,int>> s; s.insert(make_pair(1,2)); s.insert(make_pair(1,2)); s.insert(make_pair(0,9)); cout<<s.size()<<" "<<s.begin()->first<<endl; return 0; }`, '', '2 0'],

  ['queue+stack', `#include <bits/stdc++.h>
using namespace std;
int main(){ queue<int> q; q.push(1); q.push(2); cout<<q.front()<<endl; q.pop(); cout<<q.front()<<endl; stack<int> s; s.push(7); cout<<s.top()<<endl; return 0; }`, '', '1\n2\n7'],

  ['queue<pair>', `#include <bits/stdc++.h>
using namespace std;
int main(){ queue<pair<int,int>> q; q.push(make_pair(1,2)); q.push(make_pair(3,4)); pair<int,int> p=q.front(); cout<<p.first+p.second<<endl; return 0; }`, '', '3'],

  ['lower_bound', `#include <bits/stdc++.h>
using namespace std;
int main(){ int a[5]={1,3,5,7,9}; cout<<(*lower_bound(a,a+5,5))<<endl; cout<<(lower_bound(a,a+5,5)-a)<<endl; return 0; }`, '', '5\n2'],

  ['long long 大数', `#include <bits/stdc++.h>
using namespace std;
int main(){ long long x=1000000000000LL; x=x*1000; cout<<x<<endl; return 0; }`, '', '1000000000000000'],

  ['二维DP', `#include <bits/stdc++.h>
using namespace std;
int f[105][105];
int main(){ int n,m; cin>>n>>m; for(int i=1;i<=n;i++) for(int j=1;j<=m;j++){ int x; cin>>x; f[i][j]=x+max(f[i-1][j],f[i][j-1]); } cout<<f[n][m]<<endl; return 0; }`, '2 2\n1 2\n3 4\n', '8'],

  ['string', `#include <bits/stdc++.h>
using namespace std;
int main(){ string s="hello"; s+=" world"; cout<<s.size()<<"|"<<s.substr(0,5)<<endl; return 0; }`, '', '11|hello'],

  ['string 遍历', `#include <bits/stdc++.h>
using namespace std;
int main(){ string s; cin>>s; int c=0; for(int i=0;i<(int)s.size();i++) if(s[i]=='a') c++; cout<<c<<endl; return 0; }`, 'banana\n', '3'],

  ['auto range-for', `#include <bits/stdc++.h>
using namespace std;
int main(){ vector<int> v; v.push_back(1); v.push_back(2); for(auto x: v) cout<<x; return 0; }`, '', '12'],

  ['memset', `#include <bits/stdc++.h>
using namespace std;
int a[10];
int main(){ memset(a,0,sizeof(a)); a[3]=5; cout<<a[3]<<endl; return 0; }`, '', '5'],

  ['递归 DFS', `#include <bits/stdc++.h>
using namespace std;
int dfs(int n){ if(n<=1) return 1; return dfs(n-1)+dfs(n-2); }
int main(){ cout<<dfs(20)<<endl; return 0; }`, '', '10946'],

  ['引用参数', `#include <bits/stdc++.h>
using namespace std;
void add(int &x){ x+=10; }
int main(){ int a=5; add(a); cout<<a<<endl; return 0; }`, '', '15'],

  ['高精度加法', `#include <bits/stdc++.h>
using namespace std;
int main(){ string a,b; cin>>a>>b; vector<int> A,B,C; for(int i=a.size()-1;i>=0;i--) A.push_back(a[i]-'0'); for(int i=b.size()-1;i>=0;i--) B.push_back(b[i]-'0'); int t=0; for(int i=0;i<(int)max(A.size(),B.size())||t;i++){ if(i<(int)A.size()) t+=A[i]; if(i<(int)B.size()) t+=B[i]; C.push_back(t%10); t/=10; } for(int i=C.size()-1;i>=0;i--) cout<<C[i]; return 0; }`, '123 789\n', '912'],

  ['lambda 排序', `#include <bits/stdc++.h>
using namespace std;
int main(){ vector<int> v; v.push_back(3); v.push_back(1); v.push_back(2); sort(v.begin(),v.end(),[](int a,int b){ return a>b; }); for(auto x:v) cout<<x; return 0; }`, '', '321'],

  ['结构体 vector 成员', `#include <bits/stdc++.h>
using namespace std;
struct E{ int to,w; };
vector<E> g[1005];
int main(){ E e; e.to=2; e.w=5; g[1].push_back(e); cout<<g[1][0].to<<" "<<g[1][0].w<<endl; return 0; }`, '', '2 5'],

  ['BFS 邻接表', `#include <bits/stdc++.h>
using namespace std;
vector<int> g[105];
int d[105];
int main(){ int n,m; cin>>n>>m; for(int i=0;i<m;i++){int u,v;cin>>u>>v; g[u].push_back(v); g[v].push_back(u);} memset(d,-1,sizeof(d)); queue<int> q; d[1]=0; q.push(1); while(!q.empty()){ int u=q.front(); q.pop(); for(auto v: g[u]) if(d[v]<0){ d[v]=d[u]+1; q.push(v);} } cout<<d[n]<<endl; return 0; }`, '4 4\n1 2\n2 3\n3 4\n1 4\n', '1'],

  ['switch', `#include <bits/stdc++.h>
using namespace std;
int main(){ int x=2; switch(x){ case 1: cout<<"a"; break; case 2: cout<<"b"; break; default: cout<<"c"; } cout<<endl; return 0; }`, '', 'b'],

  ['三目+位运算', `#include <bits/stdc++.h>
using namespace std;
int main(){ int a=5; cout<<(a&1?"odd":"even")<<" "<<(1<<10)<<" "<<(~0)<<endl; return 0; }`, '', 'odd 1024 -1'],

  ['gcd 与 popcount', `#include <bits/stdc++.h>
using namespace std;
int main(){ cout<<__gcd(12,18)<<" "<<__builtin_popcount(7)<<endl; return 0; }`, '', '6 3'],

  ['Dijkstra 堆优化', `#include <bits/stdc++.h>
using namespace std;
struct Edge{ int to,w; };
vector<Edge> g[1005];
int d[1005];
int main(){ int n,m,s; cin>>n>>m>>s; for(int i=0;i<m;i++){int u,v,w;cin>>u>>v>>w; Edge e; e.to=v; e.w=w; g[u].push_back(e);} for(int i=1;i<=n;i++) d[i]=1e9; d[s]=0; priority_queue<pair<int,int>,vector<pair<int,int>>,greater<pair<int,int>>> pq; pq.push(make_pair(0,s)); while(!pq.empty()){ pair<int,int> p=pq.top(); pq.pop(); int u=p.second; if(p.first>d[u]) continue; for(int i=0;i<(int)g[u].size();i++){ int v=g[u][i].to,w=g[u][i].w; if(d[u]+w<d[v]){ d[v]=d[u]+w; pq.push(make_pair(d[v],v)); } } } for(int i=1;i<=n;i++) cout<<d[i]<<" "; return 0; }`, '4 5 1\n1 2 2\n1 3 5\n2 3 1\n2 4 6\n3 4 2\n', '0 2 3 5'],

  ['并查集', `#include <bits/stdc++.h>
using namespace std;
int fa[1005];
int find(int x){ return fa[x]==x?x:fa[x]=find(fa[x]); }
int main(){ int n,m; cin>>n>>m; for(int i=1;i<=n;i++) fa[i]=i; int cnt=n; for(int i=0;i<m;i++){ int u,v; cin>>u>>v; int a=find(u),b=find(v); if(a!=b){ fa[a]=b; cnt--; } } cout<<cnt<<endl; return 0; }`, '5 3\n1 2\n2 3\n4 5\n', '2'],

  ['快速幂', `#include <bits/stdc++.h>
using namespace std;
long long qpow(long long a,long long b,long long mod){ long long r=1; while(b){ if(b&1) r=r*a%mod; a=a*a%mod; b>>=1; } return r; }
int main(){ cout<<qpow(2,100,1000000007)<<endl; return 0; }`, '', '976371285'],

  ['线段树区间和', `#include <bits/stdc++.h>
using namespace std;
int n; long long sum[400005], tag[400005], a[100005];
void build(int p,int l,int r){ if(l==r){ sum[p]=a[l]; return; } int mid=(l+r)>>1; build(p<<1,l,mid); build(p<<1|1,mid+1,r); sum[p]=sum[p<<1]+sum[p<<1|1]; }
void pushdown(int p,int l,int r){ if(!tag[p]) return; int mid=(l+r)>>1; sum[p<<1]+=tag[p]*(mid-l+1); sum[p<<1|1]+=tag[p]*(r-mid); tag[p<<1]+=tag[p]; tag[p<<1|1]+=tag[p]; tag[p]=0; }
void update(int p,int l,int r,int ql,int qr,long long v){ if(ql<=l&&r<=qr){ sum[p]+=v*(r-l+1); tag[p]+=v; return; } pushdown(p,l,r); int mid=(l+r)>>1; if(ql<=mid) update(p<<1,l,mid,ql,qr,v); if(qr>mid) update(p<<1|1,mid+1,r,ql,qr,v); sum[p]=sum[p<<1]+sum[p<<1|1]; }
long long query(int p,int l,int r,int ql,int qr){ if(ql<=l&&r<=qr) return sum[p]; pushdown(p,l,r); int mid=(l+r)>>1; long long s=0; if(ql<=mid) s+=query(p<<1,l,mid,ql,qr); if(qr>mid) s+=query(p<<1|1,mid+1,r,ql,qr); return s; }
int main(){ int m; cin>>n>>m; for(int i=1;i<=n;i++) cin>>a[i]; build(1,1,n); for(int i=0;i<m;i++){ int op,x,y; long long v; cin>>op>>x>>y; if(op==1){ cin>>v; update(1,1,n,x,y,v); } else cout<<query(1,1,n,x,y)<<endl; } return 0; }`, '5 3\n1 2 3 4 5\n2 1 3\n1 1 5 10\n2 1 5\n', '6\n65'],

  ['单调栈', `#include <bits/stdc++.h>
using namespace std;
int a[100005], ans[100005];
int main(){ int n; cin>>n; for(int i=1;i<=n;i++) cin>>a[i]; stack<int> st; for(int i=n;i>=1;i--){ while(!st.empty()&&a[st.top()]<=a[i]) st.pop(); ans[i]=st.empty()?0:st.top(); st.push(i); } for(int i=1;i<=n;i++) cout<<ans[i]<<" "; return 0; }`, '5\n3 1 4 1 5\n', '3 3 5 5 0'],

  ['vector<vector<int>>', `#include <bits/stdc++.h>
using namespace std;
int main(){ int n,m; cin>>n>>m; vector<vector<int>> g(n+1); for(int i=0;i<m;i++){ int u,v; cin>>u>>v; g[u].push_back(v); } for(int i=1;i<=n;i++){ cout<<i<<":"; for(auto x: g[i]) cout<<x; cout<<endl; } return 0; }`, '3 2\n1 2\n1 3\n', '1:23\n2:\n3:'],

  ['while(scanf!=EOF)', `#include <bits/stdc++.h>
using namespace std;
int main(){ int x, s=0; while(scanf("%d",&x)!=EOF){ s+=x; } cout<<s<<endl; return 0; }`, '1 2 3 4 5\n', '15'],

  ['多测 memset', `#include <bits/stdc++.h>
using namespace std;
int f[105];
int main(){ int T; cin>>T; while(T--){ memset(f,0,sizeof(f)); int n; cin>>n; f[1]=1; for(int i=2;i<=n;i++) f[i]=f[i-1]+f[i-2]; cout<<f[n]<<endl; } return 0; }`, '2\n5\n6\n', '5\n8'],

  ['unique 去重', `#include <bits/stdc++.h>
using namespace std;
int a[10];
int main(){ int n; cin>>n; for(int i=0;i<n;i++) cin>>a[i]; sort(a,a+n); int k=unique(a,a+n)-a; cout<<k<<endl; for(int i=0;i<k;i++) cout<<a[i]<<" "; return 0; }`, '6\n1 1 2 2 2 3\n', '3\n1 2 3'],

  ['unsigned 哈希溢出', `#include <bits/stdc++.h>
using namespace std;
int main(){ unsigned int h=0; string s="abc"; for(int i=0;i<(int)s.size();i++) h=h*131+s[i]; cout<<h<<endl; return 0; }`, '', '1677554'],

  ['0-1 背包', `#include <bits/stdc++.h>
using namespace std;
int w[105],v[105],f[1005];
int main(){ int n,m; cin>>n>>m; for(int i=1;i<=n;i++) cin>>w[i]>>v[i]; for(int i=1;i<=n;i++) for(int j=m;j>=w[i];j--) f[j]=max(f[j],f[j-w[i]]+v[i]); cout<<f[m]<<endl; return 0; }`, '3 5\n1 2\n2 3\n3 4\n', '7'],

  ['归并排序逆序对', `#include <bits/stdc++.h>
using namespace std;
int a[100005], t[100005];
long long msort(int l,int r){ if(l>=r) return 0; int mid=(l+r)>>1; long long c=msort(l,mid)+msort(mid+1,r); int i=l,j=mid+1,k=l; while(i<=mid&&j<=r){ if(a[i]<=a[j]) t[k++]=a[i++]; else { c+=mid-i+1; t[k++]=a[j++]; } } while(i<=mid) t[k++]=a[i++]; while(j<=r) t[k++]=a[j++]; for(int x=l;x<=r;x++) a[x]=t[x]; return c; }
int main(){ int n; cin>>n; for(int i=1;i<=n;i++) cin>>a[i]; cout<<msort(1,n)<<endl; return 0; }`, '5\n5 4 3 2 1\n', '10'],
  ['long long 打印 %lld', `#include <bits/stdc++.h>
using namespace std;
int main(){ long long s=5000000000LL; printf("%lld\\n", s); return 0; }`, '', '5000000000'],

  ['long long 累加 1e6', `#include <bits/stdc++.h>
using namespace std;
int main(){ long long s=0; for(int i=1;i<=1000000;i++) s+=i; printf("%lld\\n", s); return 0; }`, '', '500000500000'],

  ['long long 乘法超 2^53', `#include <bits/stdc++.h>
using namespace std;
int main(){ long long a=3037000499LL, b=3037000499LL; printf("%lld\\n", a*b); return 0; }`, '', '9223372030926249001'],

  ['int 溢出仍按 32 位', `#include <bits/stdc++.h>
using namespace std;
int main(){ int s=50000; s=s*100000; printf("%d\\n", s); return 0; }`, '', '705032704'],

  ['unsigned 环绕', `#include <bits/stdc++.h>
using namespace std;
int main(){ unsigned x=4294967295u; x=x+1u; printf("%u\\n", x); return 0; }`, '', '0'],

];

const filter = process.argv[2];
let pass = 0, fail = 0;
const fails = [];

for (const [name, src, input, expect] of CASES) {
  if (filter && name.indexOf(filter) < 0) continue;
  let got = '', err = null;
  try {
    const prog = E.compile(src);
    const r = E.run(prog, input, { timeLimitMs: 5000 });
    got = r.output;
    if (r.error) err = r.error;
  } catch (e) {
    err = (e.cppLine ? `第 ${e.cppLine} 行: ` : '') + e.message;
  }
  const norm = s => String(s).replace(/\s+$/, '');
  const ok = !err && norm(got) === norm(expect);
  if (ok) pass++; else { fail++; fails.push(name); }
  if (!ok) {
    console.log('✗ ' + name);
    console.log('   期望: ' + JSON.stringify(expect));
    console.log('   实际: ' + JSON.stringify(got));
    if (err) console.log('   错误: ' + err);
  }
}

console.log(`\n引擎测试： ${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：' + fails.join('、'));
  process.exit(1);
}
