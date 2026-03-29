#!/usr/bin/env node

import { Command } from 'commander';
import { createCommand } from './commands/create';
import { devCommand } from './commands/dev';
import { buildCommand } from './commands/build';
import { validateCommand } from './commands/validate';
import { uploadCommand } from './commands/upload';

const program = new Command();

program
  .name('union')
  .description('Union Mini-App CLI Tools')
  .version('1.0.0');

program.addCommand(createCommand);
program.addCommand(devCommand);
program.addCommand(buildCommand);
program.addCommand(validateCommand);
program.addCommand(uploadCommand);

program.parse();
