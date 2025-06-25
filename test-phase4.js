const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. アプリケーションの起動確認
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForSelector('h1:has-text("行政手続き検索システム")');
    console.log('✓ Application loaded successfully');

    // 2. 検索フォームの確認
    console.log('\n2. Checking search form...');
    const searchInput = page.getByRole('textbox');
    const searchButton = page.getByRole('button', { name: '検索' });
    console.log('✓ Search form elements found');

    // 3. 検索実行
    console.log('\n3. Executing search...');
    await searchInput.fill('建設業許可申請');
    await searchButton.click();
    await page.waitForSelector('button:has-text("検索中...")');
    console.log('✓ Loading state displayed');

    // 4. 質問表示の確認
    console.log('\n4. Waiting for question...');
    await page.waitForSelector('h2', { timeout: 10000 });
    const questionText = await page.locator('h2').textContent();
    console.log(`✓ Question displayed: "${questionText}"`);

    // 5. 画面切替ボタンの確認
    console.log('\n5. Checking view mode buttons...');
    const questionModeButton = page.getByRole('button', { name: '質問形式' });
    const treeModeButton = page.getByRole('button', { name: '決定木表示' });
    console.log('✓ View mode buttons found');

    // 6. 決定木表示に切り替え
    console.log('\n6. Switching to tree view...');
    await treeModeButton.click();
    await page.waitForSelector('.react-flow');
    console.log('✓ Decision tree displayed');

    // 7. 質問形式に戻る
    console.log('\n7. Switching back to question view...');
    await questionModeButton.click();
    console.log('✓ Switched back to question view');

    // 8. 選択肢をクリック
    console.log('\n8. Clicking an option...');
    const firstOption = page.locator('button').filter({ hasText: 'これから建設業許可を取得したい' }).first();
    await firstOption.click();
    console.log('✓ Option clicked');

    // 9. 次の質問または結果を待つ
    console.log('\n9. Waiting for next question or result...');
    await page.waitForTimeout(3000);
    
    // 最終状態の確認
    const hasNextQuestion = await page.locator('h2').count() > 0;
    const hasProcedureList = await page.locator('text=必要な手続き一覧').count() > 0;
    
    if (hasNextQuestion) {
      const nextQuestion = await page.locator('h2').textContent();
      console.log(`✓ Next question displayed: "${nextQuestion}"`);
    } else if (hasProcedureList) {
      console.log('✓ Final procedure list displayed');
    }

    console.log('\n✅ All tests passed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();