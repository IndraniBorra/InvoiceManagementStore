/**
 * AI-Powered Invoice Creation Test Examples
 *
 * This file contains example queries to test the AI-powered invoice creation system.
 * Each example demonstrates different aspects of natural language processing and entity extraction.
 */

export const AI_INVOICE_TEST_EXAMPLES = [
  {
    category: "Basic Invoice Creation",
    description: "Simple invoice with customer and product details",
    examples: [
      {
        query: "Create invoice for John Smith at 123 Main St, phone 5551234567, for 5 laptops at $800 each",
        expectedEntities: {
          customer: {
            customer_name: "John Smith",
            customer_address: "123 Main St",
            customer_phone: "5551234567"
          },
          products: [
            {
              product_description: "laptops",
              lineitem_qty: 5,
              product_price: 800
            }
          ]
        }
      },
      {
        query: "New invoice for Sarah Johnson phone 5559876543 for 10 widgets $25 each",
        expectedEntities: {
          customer: {
            customer_name: "Sarah Johnson",
            customer_phone: "5559876543"
          },
          products: [
            {
              product_description: "widgets",
              lineitem_qty: 10,
              product_price: 25
            }
          ]
        }
      },
      {
        query: "Bill customer Mike Davis at 456 Oak Ave for 3 monitors at $300 per unit",
        expectedEntities: {
          customer: {
            customer_name: "Mike Davis",
            customer_address: "456 Oak Ave"
          },
          products: [
            {
              product_description: "monitors",
              lineitem_qty: 3,
              product_price: 300
            }
          ]
        }
      }
    ]
  },
  {
    category: "Multiple Products",
    description: "Invoices with multiple line items",
    examples: [
      {
        query: "Create invoice for ABC Corp at 789 Business Blvd, phone 5551111111, for 5 laptops at $800 each and 3 mice at $25 each",
        expectedEntities: {
          customer: {
            customer_name: "ABC Corp",
            customer_address: "789 Business Blvd",
            customer_phone: "5551111111"
          },
          products: [
            {
              product_description: "laptops",
              lineitem_qty: 5,
              product_price: 800
            },
            {
              product_description: "mice",
              lineitem_qty: 3,
              product_price: 25
            }
          ]
        }
      },
      {
        query: "New invoice for Tech Solutions phone 5552222222 for 2 servers $2000 each, 4 keyboards $50, and 10 cables $15 each",
        expectedEntities: {
          customer: {
            customer_name: "Tech Solutions",
            customer_phone: "5552222222"
          },
          products: [
            {
              product_description: "servers",
              lineitem_qty: 2,
              product_price: 2000
            },
            {
              product_description: "keyboards",
              lineitem_qty: 4,
              product_price: 50
            },
            {
              product_description: "cables",
              lineitem_qty: 10,
              product_price: 15
            }
          ]
        }
      }
    ]
  },
  {
    category: "Edge Cases",
    description: "Complex scenarios and edge cases",
    examples: [
      {
        query: "Invoice for Mary O'Brien at 123-A Main St Apt 5B phone 5551234567 for 1 custom software license $999.99",
        expectedEntities: {
          customer: {
            customer_name: "Mary O'Brien",
            customer_address: "123-A Main St Apt 5B",
            customer_phone: "5551234567"
          },
          products: [
            {
              product_description: "custom software license",
              lineitem_qty: 1,
              product_price: 999.99
            }
          ]
        }
      },
      {
        query: "Create invoice for customer John Smith Jr. at 999 Corporate Drive, Suite 100, for 15 office chairs at $199.50 each",
        expectedEntities: {
          customer: {
            customer_name: "John Smith Jr.",
            customer_address: "999 Corporate Drive, Suite 100"
          },
          products: [
            {
              product_description: "office chairs",
              lineitem_qty: 15,
              product_price: 199.50
            }
          ]
        }
      }
    ]
  },
  {
    category: "Partial Information",
    description: "Test cases with missing information",
    examples: [
      {
        query: "Create invoice for Global Industries for 100 units at $5 each",
        expectedEntities: {
          customer: {
            customer_name: "Global Industries"
          },
          products: [
            {
              product_description: "units",
              lineitem_qty: 100,
              product_price: 5
            }
          ]
        }
      },
      {
        query: "New invoice phone 5551234567 for 20 items $12.50 each",
        expectedEntities: {
          customer: {
            customer_phone: "5551234567"
          },
          products: [
            {
              product_description: "items",
              lineitem_qty: 20,
              product_price: 12.50
            }
          ]
        }
      }
    ]
  },
  {
    category: "Negative Tests",
    description: "Queries that should not trigger entity extraction",
    examples: [
      {
        query: "Show all invoices",
        expectedEntities: null,
        shouldFallback: true
      },
      {
        query: "Create new invoice",
        expectedEntities: null,
        shouldFallback: true
      },
      {
        query: "List customers",
        expectedEntities: null,
        shouldFallback: true
      }
    ]
  }
];

/**
 * Test runner for AI invoice creation
 * Can be used in browser console or test environment
 */
export const runAIInvoiceTests = (extractInvoiceEntities) => {
  console.log('🧪 Running AI Invoice Creation Tests...\n');

  let totalTests = 0;
  let passedTests = 0;

  AI_INVOICE_TEST_EXAMPLES.forEach(category => {
    console.log(`\n📋 Testing: ${category.category}`);
    console.log(`📝 Description: ${category.description}\n`);

    category.examples.forEach((example, index) => {
      totalTests++;
      console.log(`🔍 Test ${index + 1}: "${example.query}"`);

      try {
        const result = extractInvoiceEntities(example.query);

        if (example.shouldFallback) {
          // This should not extract meaningful entities
          const hasCustomer = result.customer && (result.customer.customer_name || result.customer.customer_phone);
          const hasProducts = result.products && result.products.length > 0;

          if (!hasCustomer && !hasProducts) {
            console.log('✅ PASS: Correctly identified as non-entity query');
            passedTests++;
          } else {
            console.log('❌ FAIL: Should not have extracted entities');
            console.log('   Extracted:', result);
          }
        } else {
          // This should extract entities
          let testPassed = true;
          const failures = [];

          // Check customer extraction
          if (example.expectedEntities.customer) {
            Object.keys(example.expectedEntities.customer).forEach(field => {
              const expected = example.expectedEntities.customer[field];
              const actual = result.customer?.[field];

              if (actual !== expected) {
                testPassed = false;
                failures.push(`Customer ${field}: expected "${expected}", got "${actual}"`);
              }
            });
          }

          // Check product extraction
          if (example.expectedEntities.products) {
            example.expectedEntities.products.forEach((expectedProduct, prodIndex) => {
              const actualProduct = result.products?.[prodIndex];

              if (!actualProduct) {
                testPassed = false;
                failures.push(`Missing product ${prodIndex + 1}`);
                return;
              }

              Object.keys(expectedProduct).forEach(field => {
                const expected = expectedProduct[field];
                const actual = actualProduct[field];

                if (actual !== expected) {
                  testPassed = false;
                  failures.push(`Product ${prodIndex + 1} ${field}: expected "${expected}", got "${actual}"`);
                }
              });
            });
          }

          if (testPassed) {
            console.log('✅ PASS: All entities extracted correctly');
            passedTests++;
          } else {
            console.log('❌ FAIL: Entity extraction issues:');
            failures.forEach(failure => console.log(`   - ${failure}`));
          }
        }

      } catch (error) {
        console.log('❌ ERROR:', error.message);
      }

      console.log(''); // Empty line for readability
    });
  });

  console.log(`\n🏁 Test Results: ${passedTests}/${totalTests} passed (${((passedTests/totalTests)*100).toFixed(1)}%)`);

  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! AI invoice creation is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Please check the entity extraction logic.');
  }

  return { total: totalTests, passed: passedTests };
};

export default AI_INVOICE_TEST_EXAMPLES;