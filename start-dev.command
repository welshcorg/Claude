#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "처음 실행이라 필요한 패키지를 설치합니다. 잠시만 기다려주세요..."
  npm install
fi

echo "개발 서버를 시작합니다. 잠시 후 브라우저가 자동으로 열립니다."
( sleep 2 && open http://localhost:5173 ) &
npm run dev
