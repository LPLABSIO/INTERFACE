#!/usr/bin/env node

/**
 * CLI for Project Generator
 * Usage: node src/projects/generator/cli.js <project-name> [options]
 */

const ProjectGenerator = require('./ProjectGenerator');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n🚀 Project Generator - Automation Platform\n');

  try {
    // Get project name from args or prompt
    let projectName = process.argv[2];

    if (!projectName) {
      projectName = await question('Enter project name (e.g., Tinder, Bumble): ');
    }

    // Validate name
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(projectName)) {
      console.error('❌ Invalid name. Use only letters, numbers, and hyphens.');
      process.exit(1);
    }

    // Ask for project details
    console.log('\n📋 Project Configuration:\n');

    const description = await question(`Description [${projectName} automation]: `)
      || `${projectName} automation`;

    const version = await question('Version [1.0.0]: ') || '1.0.0';

    const author = await question('Author [Automation Platform]: ')
      || 'Automation Platform';

    // Ask for providers
    const providersInput = await question('Providers (comma-separated) [sms,proxy]: ')
      || 'sms,proxy';
    const providers = providersInput.split(',').map(p => p.trim());

    // Ask for flows
    const flowsInput = await question('Flows (comma-separated) [main,recovery]: ')
      || 'main,recovery';
    const flows = flowsInput.split(',').map(f => f.trim());

    // Ask for additional options
    const generateTests = await question('Generate test file? (y/n) [y]: ');
    const generateDocs = await question('Generate documentation? (y/n) [y]: ');

    console.log('\n⚙️  Generating project...\n');

    // Create generator instance
    const generator = new ProjectGenerator();

    // Generate project
    const result = await generator.generateProject(projectName, {
      description,
      version,
      author,
      providers,
      flows,
      generateTests: generateTests !== 'n',
      generateDocs: generateDocs !== 'n'
    });

    if (result.success) {
      console.log('\n✅ Project generated successfully!\n');
      console.log('📁 Location:', result.path);
      console.log('\n📖 Next steps:');
      console.log('1. Edit the generated file to add your specific logic');
      console.log('2. Configure providers in the setupProviders() method');
      console.log('3. Add flow steps in the setupFlows() method');
      console.log('4. Test with: npm run test:projects');
      console.log('\n🎯 Usage example:\n');
      console.log(`const ${projectName}Project = require('${result.path}');`);
      console.log(`const project = new ${projectName}Project(config);`);
      console.log('await project.initialize();');
      console.log('const result = await project.execute();');
    } else {
      console.error('\n❌ Generation failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle CLI vs module usage
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };