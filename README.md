# 日语五十音闯关学习程序

一个纯前端 PWA，面向中文母语零基础学习者。当前包含完整基础五十音的逐行学习、行测试、错题测试、综合测试、学习记录和日语发音。

## 本地运行

可以直接用静态服务器打开：

```bash
python -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 部署

项目无后端、无构建步骤，可直接部署到 GitHub Pages、Cloudflare Pages 或 Vercel 的静态站点模式。

GitHub Pages 地址：<https://41992490wjj.github.io/kana-quest/>

## 代码结构

- `src/data.js`：课程数据，后续扩展完整五十音、浊音、半浊音、拗音等从这里开始。
- `src/learning.js`：题目生成、掌握度、通过条件和答题计分逻辑。
- `src/storage.js`：固定 key、本地存储、schema migration、导入校验和导出。
- `src/speech.js`：独立的 Web Speech API 日语发音模块。
- `src/app.js`：界面状态和交互。
- `sw.js` / `manifest.webmanifest`：PWA 离线缓存和安装信息。

## 学习记录兼容

学习记录固定保存在 `localStorage` 的 `kanaQuest:v1`。存档内部使用 `schemaVersion`，新增课程时会合并默认记录并保留已有统计。迁移或导入失败时不会删除或覆盖原始存档。

## 测试

```bash
node tests/run-tests.mjs
```

## MVP 掌握度规则

每个假名需要至少练习 3 次，熟练度达到 80%，最近记录正确率不低于 75%，且最近一次不是答错，才算掌握。整行所有平假名和片假名都掌握后，行状态变为已通过。
