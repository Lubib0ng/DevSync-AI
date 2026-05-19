// 백엔드 URL 설정
// 로컬 개발: localhost:8000
// 배포: Railway URL (환경변수로 관리)
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

export default BACKEND_URL;
