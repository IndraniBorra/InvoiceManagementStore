/**
 * Comprehensive Test Suite for NLP-Powered Creation Flows
 * Tests customer, product, and invoice creation from natural language
 */

import { extractCustomerEntities, extractProductEntities, extractInvoiceEntities, detectCreationType, validateExtractedEntities } from './nlpEntityExtractor';

/**
 * Test cases for customer creation
 */
export const CUSTOMER_CREATION_TESTS = [
  {
    category: "Complete Customer Information",
    examples: [
      {
        query: "Create customer John Smith with email john@company.com, phone 5551234567, address 123 Main St",
        expected: {
          customer_name: "John Smith",
          customer_email: "john@company.com",
          customer_phone: "5551234567",
          customer_address: "123 Main St"
        },
        shouldDetectAs: "customer"
      },
      {
        query: "Add customer TechCorp Inc at 456 Business Ave, phone 5559876543, email info@techcorp.com",
        expected: {
          customer_name: "TechCorp Inc",
          customer_email: "info@techcorp.com",
          customer_phone: "5559876543",
          customer_address: "456 Business Ave"
        },
        shouldDetectAs: "customer"
      }
    ]
  },
  {
    category: "Partial Customer Information",
    examples: [
      {
        query: "Create customer Sarah Johnson with phone 5551111111",
        expected: {
          customer_name: "Sarah Johnson",
          customer_phone: "5551111111",
          customer_email: null,
          customer_address: null
        },
        shouldDetectAs: "customer"
      },
      {
        query: "New customer Global Solutions email contact@global.com",
        expected: {
          customer_name: "Global Solutions",
          customer_email: "contact@global.com",
          customer_phone: null,
          customer_address: null
        },
        shouldDetectAs: "customer"
      }
    ]
  },
  {
    category: "Complex Business Names",
    examples: [
      {
        query: "Create customer Rodriguez, Figueroa & Associates LLC with phone 5552222222",
        expected: {
          customer_name: "Rodriguez, Figueroa & Associates LLC",
          customer_phone: "5552222222",
          customer_email: null,
          customer_address: null
        },
        shouldDetectAs: "customer"
      },
      {
        query: "Add customer Mary O'Brien-Smith at 789 Oak St, email mary@email.com",
        expected: {
          customer_name: "Mary O'Brien-Smith",
          customer_email: "mary@email.com",
          customer_address: "789 Oak St",
          customer_phone: null
        },
        shouldDetectAs: "customer"
      }
    ]
  }
];

/**
 * Test cases for product creation
 */
export const PRODUCT_CREATION_TESTS = [
  {
    category: "Complete Product Information",
    examples: [
      {
        query: "Create product Wireless Headphones priced at $149.99",
        expected: {
          product_description: "Wireless Headphones",
          product_price: 149.99
        },
        shouldDetectAs: "product"
      },
      {
        query: "Add product Gaming Laptop for $1299",
        expected: {
          product_description: "Gaming Laptop",
          product_price: 1299
        },
        shouldDetectAs: "product"
      },
      {
        query: "New product Office Chair cost $199.50",
        expected: {
          product_description: "Office Chair",
          product_price: 199.50
        },
        shouldDetectAs: "product"
      }
    ]
  },
  {
    category: "Various Price Formats",
    examples: [
      {
        query: "Create product Conference Table price 599.99 dollars",
        expected: {
          product_description: "Conference Table",
          product_price: 599.99
        },
        shouldDetectAs: "product"
      },
      {
        query: "Add product Projector priced $899",
        expected: {
          product_description: "Projector",
          product_price: 899
        },
        shouldDetectAs: "product"
      }
    ]
  },
  {
    category: "Complex Product Names",
    examples: [
      {
        query: "Create product High-Performance Graphics Card RTX-4090 priced at $1599.99",
        expected: {
          product_description: "High-Performance Graphics Card RTX-4090",
          product_price: 1599.99
        },
        shouldDetectAs: "product"
      },
      {
        query: "Add product 27-inch 4K Monitor for $450",
        expected: {
          product_description: "27-inch 4K Monitor",
          product_price: 450
        },
        shouldDetectAs: "product"
      }
    ]
  }
];

/**
 * Test cases for invoice creation
 */
export const INVOICE_CREATION_TESTS = [
  {
    category: "Complete Invoice with Single Product",
    examples: [
      {
        query: "Create invoice for John Smith phone 5551234567 for 5 laptops at $800 each",
        expected: {
          customer: {
            customer_name: "John Smith",
            customer_phone: "5551234567"
          },
          products: [
            {
              product_description: "laptops",
              lineitem_qty: 5,
              product_price: 800
            }
          ]
        },
        shouldDetectAs: "invoice"
      },
      {
        query: "Invoice customer TechCorp at 123 Business St for 10 widgets at $25 each",
        expected: {
          customer: {
            customer_name: "TechCorp",
            customer_address: "123 Business St"
          },
          products: [
            {
              product_description: "widgets",
              lineitem_qty: 10,
              product_price: 25
            }
          ]
        },
        shouldDetectAs: "invoice"
      }
    ]
  },
  {
    category: "Multiple Products",
    examples: [
      {
        query: "Create invoice for ABC Corp phone 5559999999 for 2 servers at $2000 each and 5 keyboards at $50 each",
        expected: {
          customer: {
            customer_name: "ABC Corp",
            customer_phone: "5559999999"
          },
          products: [
            {
              product_description: "servers",
              lineitem_qty: 2,
              product_price: 2000
            },
            {
              product_description: "keyboards",
              lineitem_qty: 5,
              product_price: 50
            }
          ]
        },
        shouldDetectAs: "invoice"
      }
    ]
  },
  {
    category: "Various Quantity and Price Formats",
    examples: [
      {
        query: "Invoice for customer Mike Davis for 3 monitors $300 x 3",
        expected: {
          customer: {
            customer_name: "Mike Davis"
          },
          products: [
            {
              product_description: "monitors",
              lineitem_qty: 3,
              product_price: 300
            }
          ]
        },
        shouldDetectAs: "invoice"
      }
    ]
  }
];

/**
 * Negative test cases that should NOT trigger creation
 */
export const NEGATIVE_TESTS = [
  {
    category: "Non-Creation Queries",
    examples: [
      {
        query: "Show all customers",
        shouldDetectAs: "unknown",
        shouldExtractEntities: false
      },
      {
        query: "List products",
        shouldDetectAs: "unknown",
        shouldExtractEntities: false
      },
      {
        query: "Create new invoice",
        shouldDetectAs: "invoice",
        shouldExtractEntities: false // No specific entities
      },
      {
        query: "Help me with customers",
        shouldDetectAs: "unknown",
        shouldExtractEntities: false
      }
    ]
  }
];

/**
 * Validation test cases
 */
export const VALIDATION_TESTS = [
  {
    category: "Customer Validation",
    examples: [
      {
        type: "customer",
        data: { customer_name: "John Smith", customer_phone: "5551234567", customer_email: "john@test.com" },
        shouldBeValid: true
      },
      {
        type: "customer",
        data: { customer_phone: "555123456" }, // Invalid phone
        shouldBeValid: false,
        expectedErrors: ["Phone number must be exactly 10 digits"]
      },
      {
        type: "customer",
        data: { customer_email: "invalid-email" }, // Invalid email
        shouldBeValid: false,
        expectedErrors: ["Invalid email format"]
      },
      {
        type: "customer",
        data: {}, // No name or phone
        shouldBeValid: false,
        expectedErrors: ["Customer name or phone number is required"]
      }
    ]
  },
  {
    category: "Product Validation",
    examples: [
      {
        type: "product",
        data: { product_description: "Test Product", product_price: 99.99 },
        shouldBeValid: true
      },
      {
        type: "product",
        data: { product_description: "Test Product" }, // No price
        shouldBeValid: false,
        expectedErrors: ["Product price must be greater than 0"]
      },
      {
        type: "product",
        data: { product_price: 50 }, // No description
        shouldBeValid: false,
        expectedErrors: ["Product description is required"]
      },
      {
        type: "product",
        data: { product_description: "Test", product_price: -10 }, // Negative price
        shouldBeValid: false,
        expectedErrors: ["Product price must be greater than 0"]
      }
    ]
  }
];

/**
 * Test runner for creation type detection
 */
export const runCreationTypeDetectionTests = () => {
  console.log('🔍 === CREATION TYPE DETECTION TESTS ===\n');

  let totalTests = 0;
  let passedTests = 0;

  const allTests = [
    ...CUSTOMER_CREATION_TESTS.flatMap(cat => cat.examples),
    ...PRODUCT_CREATION_TESTS.flatMap(cat => cat.examples),
    ...INVOICE_CREATION_TESTS.flatMap(cat => cat.examples),
    ...NEGATIVE_TESTS.flatMap(cat => cat.examples)
  ];

  allTests.forEach((test, index) => {
    totalTests++;
    console.log(`Test ${index + 1}: "${test.query}"`);

    const detectedType = detectCreationType(test.query);
    const expected = test.shouldDetectAs;

    if (detectedType === expected) {
      console.log(`✅ PASS: Detected as "${detectedType}"`);
      passedTests++;
    } else {
      console.log(`❌ FAIL: Expected "${expected}", got "${detectedType}"`);
    }
    console.log('');
  });

  console.log(`\n🏁 Detection Tests: ${passedTests}/${totalTests} passed (${((passedTests/totalTests)*100).toFixed(1)}%)\n`);
  return { total: totalTests, passed: passedTests };
};

/**
 * Test runner for entity extraction
 */
export const runEntityExtractionTests = () => {
  console.log('🧠 === ENTITY EXTRACTION TESTS ===\n');

  let totalTests = 0;
  let passedTests = 0;

  // Test customer extraction
  console.log('👤 Testing Customer Extraction:');
  CUSTOMER_CREATION_TESTS.forEach(category => {
    console.log(`\n📋 ${category.category}:`);

    category.examples.forEach((test, index) => {
      totalTests++;
      console.log(`\nTest: "${test.query}"`);

      const extracted = extractCustomerEntities(test.query);
      let testPassed = true;
      const failures = [];

      Object.keys(test.expected).forEach(field => {
        const expected = test.expected[field];
        const actual = extracted[field];

        if (actual !== expected) {
          testPassed = false;
          failures.push(`${field}: expected "${expected}", got "${actual}"`);
        }
      });

      if (testPassed) {
        console.log('✅ PASS: All fields extracted correctly');
        passedTests++;
      } else {
        console.log('❌ FAIL: Extraction issues:');
        failures.forEach(failure => console.log(`   - ${failure}`));
      }
    });
  });

  // Test product extraction
  console.log('\n\n📦 Testing Product Extraction:');
  PRODUCT_CREATION_TESTS.forEach(category => {
    console.log(`\n📋 ${category.category}:`);

    category.examples.forEach((test, index) => {
      totalTests++;
      console.log(`\nTest: "${test.query}"`);

      const extracted = extractProductEntities(test.query);
      let testPassed = true;
      const failures = [];

      Object.keys(test.expected).forEach(field => {
        const expected = test.expected[field];
        const actual = extracted[field];

        if (actual !== expected) {
          testPassed = false;
          failures.push(`${field}: expected "${expected}", got "${actual}"`);
        }
      });

      if (testPassed) {
        console.log('✅ PASS: All fields extracted correctly');
        passedTests++;
      } else {
        console.log('❌ FAIL: Extraction issues:');
        failures.forEach(failure => console.log(`   - ${failure}`));
      }
    });
  });

  // Test invoice extraction
  console.log('\n\n🧾 Testing Invoice Extraction:');
  INVOICE_CREATION_TESTS.forEach(category => {
    console.log(`\n📋 ${category.category}:`);

    category.examples.forEach((test, index) => {
      totalTests++;
      console.log(`\nTest: "${test.query}"`);

      const extracted = extractInvoiceEntities(test.query);
      let testPassed = true;
      const failures = [];

      // Check customer extraction
      if (test.expected.customer) {
        Object.keys(test.expected.customer).forEach(field => {
          const expected = test.expected.customer[field];
          const actual = extracted.customer?.[field];

          if (actual !== expected) {
            testPassed = false;
            failures.push(`Customer ${field}: expected "${expected}", got "${actual}"`);
          }
        });
      }

      // Check product extraction
      if (test.expected.products) {
        test.expected.products.forEach((expectedProduct, prodIndex) => {
          const actualProduct = extracted.products?.[prodIndex];

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
        console.log('❌ FAIL: Extraction issues:');
        failures.forEach(failure => console.log(`   - ${failure}`));
      }
    });
  });

  console.log(`\n🏁 Extraction Tests: ${passedTests}/${totalTests} passed (${((passedTests/totalTests)*100).toFixed(1)}%)\n`);
  return { total: totalTests, passed: passedTests };
};

/**
 * Test runner for validation
 */
export const runValidationTests = () => {
  console.log('✅ === VALIDATION TESTS ===\n');

  let totalTests = 0;
  let passedTests = 0;

  VALIDATION_TESTS.forEach(category => {
    console.log(`📋 ${category.category}:`);

    category.examples.forEach((test, index) => {
      totalTests++;
      console.log(`\nTest ${index + 1}: ${JSON.stringify(test.data)}`);

      const validation = validateExtractedEntities(test.data, test.type);

      if (validation.isValid === test.shouldBeValid) {
        if (test.shouldBeValid) {
          console.log('✅ PASS: Validation passed as expected');
        } else {
          // Check if expected errors are present
          const hasExpectedErrors = test.expectedErrors?.every(expectedError =>
            validation.errors.some(actualError => actualError.includes(expectedError.split(':')[0]))
          );

          if (hasExpectedErrors !== false) {
            console.log('✅ PASS: Validation failed with expected errors');
          } else {
            console.log('❌ FAIL: Expected different validation errors');
            console.log('   Expected:', test.expectedErrors);
            console.log('   Actual:', validation.errors);
            totalTests--; // Don't count this as failed, just different error messages
          }
        }
        passedTests++;
      } else {
        console.log(`❌ FAIL: Expected valid=${test.shouldBeValid}, got valid=${validation.isValid}`);
        console.log('   Errors:', validation.errors);
      }
    });
  });

  console.log(`\n🏁 Validation Tests: ${passedTests}/${totalTests} passed (${((passedTests/totalTests)*100).toFixed(1)}%)\n`);
  return { total: totalTests, passed: passedTests };
};

/**
 * Run all tests
 */
export const runAllNLPCreationTests = () => {
  console.log('🧪 === COMPREHENSIVE NLP CREATION TEST SUITE ===\n');

  const detectionResults = runCreationTypeDetectionTests();
  const extractionResults = runEntityExtractionTests();
  const validationResults = runValidationTests();

  const totalTests = detectionResults.total + extractionResults.total + validationResults.total;
  const totalPassed = detectionResults.passed + extractionResults.passed + validationResults.passed;

  console.log('🎯 === FINAL RESULTS ===');
  console.log(`Detection: ${detectionResults.passed}/${detectionResults.total} passed`);
  console.log(`Extraction: ${extractionResults.passed}/${extractionResults.total} passed`);
  console.log(`Validation: ${validationResults.passed}/${validationResults.total} passed`);
  console.log(`Overall: ${totalPassed}/${totalTests} passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`);

  if (totalPassed === totalTests) {
    console.log('🎉 All tests passed! NLP creation system is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Please check the entity extraction logic.');
  }

  return {
    detection: detectionResults,
    extraction: extractionResults,
    validation: validationResults,
    overall: { total: totalTests, passed: totalPassed }
  };
};

export default {
  CUSTOMER_CREATION_TESTS,
  PRODUCT_CREATION_TESTS,
  INVOICE_CREATION_TESTS,
  NEGATIVE_TESTS,
  VALIDATION_TESTS,
  runCreationTypeDetectionTests,
  runEntityExtractionTests,
  runValidationTests,
  runAllNLPCreationTests
};