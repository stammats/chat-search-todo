// Performance test for Phase 5

async function testCachePerformance() {
  console.log('🧪 Testing cache performance...\n');
  
  try {
    // Test 1: First search (cache miss)
    console.log('Test 1: First search request');
    console.time('First search');
    const response1 = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '建設業許可申請' })
    });
    console.timeEnd('First search');
    const data1 = await response1.json();
    console.log('Result:', data1.mode === 'question' ? '✓ Question received' : '✗ Error');
    
    // Test 2: Same search (cache hit)
    console.log('\nTest 2: Same search request (should be cached)');
    console.time('Cached search');
    const response2 = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '建設業許可申請' })
    });
    console.timeEnd('Cached search');
    const data2 = await response2.json();
    console.log('Result:', data2.mode === 'question' ? '✓ Question received from cache' : '✗ Error');
    
    // Test 3: Check cache statistics
    console.log('\nTest 3: Cache statistics');
    const statsResponse = await fetch('http://localhost:3000/api/cache-stats');
    const stats = await statsResponse.json();
    console.log('Cache Stats:', JSON.stringify(stats, null, 2));
    
    // Test 4: Different search
    console.log('\nTest 4: Different search request');
    console.time('New search');
    const response3 = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '飲食店営業許可' })
    });
    console.timeEnd('New search');
    const data3 = await response3.json();
    console.log('Result:', data3.mode === 'question' ? '✓ Question received' : '✗ Error');
    
    // Final cache statistics
    console.log('\nFinal Cache Statistics:');
    const finalStatsResponse = await fetch('http://localhost:3000/api/cache-stats');
    const finalStats = await finalStatsResponse.json();
    console.log(JSON.stringify(finalStats, null, 2));
    
    console.log('\n✅ Performance test completed!');
    console.log('\nKey Findings:');
    console.log('- Memory cache hit rate:', finalStats.performance.memoryHitRate);
    console.log('- Redis connected:', finalStats.stats.redisConnected);
    console.log('- Total requests:', finalStats.stats.totalRequests);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
console.log('Make sure the development server is running: npm run dev\n');
testCachePerformance();