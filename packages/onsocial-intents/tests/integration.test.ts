/**
 * Live Integration Test for NEAR Intents API
 * 
 * Tests actual API calls to NEAR Intents to verify:
 * - Currency PriceMode conversion
 * - Real-time pricing oracle
 * - Token support
 */

import {
  IntentsClient,
  convertToNear,
  getPrice,
  getNearPriceUsd,
  formatCurrency,
  formatNear,
  createCurrencyPrice,
  createNearPrice,
  type PriceMode,
} from '../src/index';

async function main() {
  console.log('🧪 NEAR Intents Integration Test\n');
  console.log('='  .repeat(60));

  // Test 1: Currency PriceMode - $50 Ticket
  console.log('\n📍 Test 1: Currency PriceMode ($50 USD Ticket)');
  console.log('-'.repeat(60));
  
  const ticketPrice: PriceMode = createCurrencyPrice('50000000', 'USD');
  console.log('Ticket price:', ticketPrice.type === 'Currency' ? formatCurrency(ticketPrice.amount, 'USD') : 'N/A');
  
  try {
    const nearPrice = await convertToNear(ticketPrice);
    const nearFormatted = formatNear(nearPrice);
    console.log('✅ NEAR equivalent:', nearFormatted);
    console.log('   Raw yoctoNEAR:', nearPrice);
  } catch (error) {
    console.error('❌ Error:', error);
  }

  // Test 2: Get NEAR price in USD
  console.log('\n📍 Test 2: Get Current NEAR Price in USD');
  console.log('-'.repeat(60));
  
  try {
    const nearUsdPrice = await getNearPriceUsd();
    const usdAmount = (parseInt(nearUsdPrice) / 1000000).toFixed(2); // Convert from 6 decimals
    console.log('✅ 1 NEAR = $' + usdAmount);
    console.log('   Raw amount (6 decimals):', nearUsdPrice);
  } catch (error) {
    console.error('❌ Error:', error);
  }

  // Test 3: Convert 100 USDC to NEAR
  console.log('\n📍 Test 3: Convert 100 USDC to NEAR');
  console.log('-'.repeat(60));
  
  try {
    const usdcToNear = await getPrice({
      fromCurrency: 'USDC',
      toCurrency: 'NEAR',
      amount: '100000000', // 100 USDC (6 decimals)
    });
    console.log('✅ 100 USDC =', formatNear(usdcToNear));
    console.log('   Raw yoctoNEAR:', usdcToNear);
  } catch (error) {
    console.error('❌ Error:', error);
  }

  // Test 4: Multi-price ticket listing
  console.log('\n📍 Test 4: Multi-Currency Ticket Listing');
  console.log('-'.repeat(60));
  
  const tickets = [
    createCurrencyPrice('25000000', 'USD'),  // $25
    createCurrencyPrice('50000000', 'USD'),  // $50
    createCurrencyPrice('100000000', 'USD'), // $100
  ];

  for (const ticket of tickets) {
    try {
      if (ticket.type === 'Currency') {
        const usdDisplay = formatCurrency(ticket.amount, 'USD');
        const nearPrice = await convertToNear(ticket);
        const nearDisplay = formatNear(nearPrice);
        console.log(`✅ ${usdDisplay} → ${nearDisplay}`);
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }

  // Test 5: IntentsClient - Get Quote
  console.log('\n📍 Test 5: Get Quote for USDC → NEAR Swap');
  console.log('-'.repeat(60));
  
  const client = new IntentsClient();
  
  try {
    const quote = await client.getQuote({
      dry: true, // Dry run - don't create actual swap
      swapType: 'EXACT_INPUT' as any,
      originAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', // Native USDC
      destinationAsset: 'nep141:wrap.near',
      amount: '50000000', // 50 USDC
      depositType: 'INTENTS' as any,
      recipient: 'test.near',
      recipientType: 'INTENTS' as any,
      refundTo: 'test.near',
      refundType: 'INTENTS' as any,
      slippageTolerance: 100,
      deadline: new Date(Date.now() + 3600000).toISOString(),
    });

    console.log('✅ Quote received:');
    console.log('   Input:', formatCurrency(quote.amountIn, 'USDC'));
    console.log('   Output:', formatNear(quote.amountOut));
    console.log('   Deadline:', quote.deadline);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Integration tests complete!');
  console.log('\n💡 Key Takeaways:');
  console.log('   • NEAR Intents provides real-time pricing oracle');
  console.log('   • Native USDC/USDT supported on NEAR');
  console.log('   • Currency PriceMode enables stable USD pricing');
  console.log('   • No contract changes needed for multi-token support');
  console.log('='  .repeat(60));
}

// Run tests
main().catch(console.error);
