# Claude Code開発ガイドライン

## 🎯 このドキュメントの目的

プロジェクトの開発・保守において、Claude Codeが従うべきルールと手順を定義します。

---

## 🧪 Playwright自動テストによる動作確認

### 必須確認プロセス

新機能の実装や修正を行った後は、必ずPlaywrightで以下の動作確認を実施すること：

#### 1. 基本動作確認
```javascript
// 1. アプリケーションの起動確認
await page.goto('http://localhost:3000');
await page.waitForSelector('h1:has-text("行政手続き検索システム")');

// 2. 検索フォームの存在確認
const searchInput = await page.getByRole('textbox');
const searchButton = await page.getByRole('button', { name: '検索' });
```

#### 2. 検索機能テスト
```javascript
// 1. 検索キーワード入力
await searchInput.fill('建設業許可申請');

// 2. 検索実行
await searchButton.click();

// 3. ローディング状態確認
await page.waitForSelector('button:has-text("検索中...")');

// 4. 結果表示待機（最大10秒）
await page.waitForSelector('h2', { timeout: 10000 });
```

#### 3. API統合確認
```javascript
// 1. 質問表示の確認
const questionHeading = await page.getByRole('heading', { level: 2 });
const questionText = await questionHeading.textContent();

// 2. 選択肢の確認
const options = await page.getByRole('button').all();
console.log(`選択肢数: ${options.length - 1}`); // 検索ボタンを除く

// 3. エラーハンドリング確認
// - 行政手続き以外のクエリ
await searchInput.fill('今日の天気');
await searchButton.click();
await page.waitForSelector('.bg-red-100'); // エラー表示
```

#### 4. 完了条件
- [ ] アプリケーションが正常に起動する
- [ ] 検索フォームが表示され、入力可能
- [ ] 検索実行でローディング状態が表示される
- [ ] APIからの応答で質問と選択肢が表示される
- [ ] エラー時に適切なメッセージが表示される

### テスト実行手順

1. **開発サーバー起動**
   ```bash
   npm run dev
   ```

2. **Playwrightでテスト実行**
   - MCP Playwrightツールを使用
   - 上記の確認プロセスを順次実行

3. **結果確認**
   - すべての確認項目がパスすること
   - エラーが発生した場合は修正後に再テスト

---

## 🚫 絶対禁止事項

### 1. 明示的な指示なしの機能追加
- ナビゲーションバーの追加
- 余計なボタンの追加
- 新しいコンポーネントの作成
- レイアウトの大幅変更

### 2. 推測による「改善」
- 「使いやすくするために」という主観的判断での変更
- 「デザインを改善するために」という求められていない美観向上
- 「一般的なUIパターンに合わせるために」という既存設計の無視

---

## ✅ 正しい実装方針

### 実装前チェック
1. **明示的な指示があるか？** - 曖昧な「改善して」は指示ではない
2. **最小限の変更か？** - 関連しない部分は絶対に触らない
3. **既存機能への影響はないか？** - 他コンポーネントとの競合確認

### 段階的実装
- Phase 1: 基盤構築（Next.js、環境設定）
- Phase 2: メモリキャッシュとSearchForm
- Phase 3: API統合（Brave Search、Gemini）
- Phase 4: React Flow決定木可視化
- Phase 5: パフォーマンス最適化

---

## 💡 成功の原則

1. **シンプル優先**: 複雑な設定より確実な動作
2. **段階的実装**: 動くものから始めて徐々に機能追加
3. **明示的指示**: 曖昧な指示は必ず確認
4. **単一責任**: 1回の修正で1つの機能のみ
5. **自動テスト**: Playwrightで必ず動作確認

---

**参照**: 詳細な技術仕様・実装手順は `simple-app-spec.md` を確認してください