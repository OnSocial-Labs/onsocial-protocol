import { PostThreadRouteLoading } from '@/features/home/post-thread-route-loading';
import { APP_HOME_PATH } from '@/lib/app-routes';

export default function PersonalPostLoading() {
  return <PostThreadRouteLoading backHref={APP_HOME_PATH} />;
}
