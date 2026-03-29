import typescript from '@rollup/plugin-typescript';

export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/union-sdk.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      typescript({ tsconfig: './tsconfig.json', declaration: true, declarationDir: 'dist/types' }),
    ],
  },
  // UMD build (window.Union)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/union-sdk.umd.js',
      format: 'umd',
      name: 'Union',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      typescript({ tsconfig: './tsconfig.json', declaration: false }),
    ],
  },
];
