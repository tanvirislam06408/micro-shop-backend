import { Router } from 'express';
import { healthCheck } from './health.controller.js';

const router: Router = Router();

router.get('/', healthCheck);

export { router as healthRoutes };
