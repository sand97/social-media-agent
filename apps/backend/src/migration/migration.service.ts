import { Injectable, OnModuleInit } from '@nestjs/common';

const execCommand = (command: string): Promise<any> => {
  const { exec } = require('node:child_process');

  return new Promise((resolve, reject) => {
    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        reject(error);
      }
      if (stderr) {
        resolve(stderr);
      }
      resolve(stdout);
    });
  });
};

@Injectable()
export class MigrationService implements OnModuleInit {
  onModuleInit() {
    if (process.env.MODE === 'dev') {
      void execCommand('pnpx prisma@6.16.2 studio');
    }
    this.deployPrismaMigration()
      .then((result) => {
        console.log('Prisma migration deployed', result);
      })
      .catch((error) => {
        console.error('Prisma migration failed', error);
      });
  }
  deployPrismaMigration() {
    return execCommand('pnpx prisma@6.16.2 migrate deploy');
  }
}
