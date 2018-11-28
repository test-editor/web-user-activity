import { Injectable } from '@angular/core';
import { UserActivityData, UserActivityType } from '../event-types-out';
import { MessagingService } from '@testeditor/messaging-service';
import { Subscription } from 'rxjs/Subscription';
import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/timer';
import 'rxjs/add/operator/takeUntil';
import { HttpProviderService } from '../http-provider-service/http-provider.service';

export class UserActivity implements UserActivityData {
  static readonly labelMap = new Map<UserActivityType, string>([
    [UserActivityType.RUNNING_AS_TEST, 'is executing this test'],
    [UserActivityType.OPENED_IN_EDITOR, 'is working on this file'],
    [UserActivityType.ACTIVE_IN_EDITOR, 'is working on this file'],
    [UserActivityType.DIRTY_IN_EDITOR, 'is working on this file'],
    [UserActivityType.TYPED_INTO_EDITOR, 'is working on this file'],
    [UserActivityType.DELETED_IN_WORKSPACE, 'deleted this file'],
    [UserActivityType.CREATED_IN_WORKSPACE, 'created this file'],
    [UserActivityType.MODIFIED_IN_WORKSPACE, 'changed this file'],
  ]);

  constructor(public readonly user: string, public readonly type: UserActivityType) { }

  get label(): string { return `${this.user} ${UserActivity.labelMap.get(this.type)}`; }

}

export interface UserActivityEvent { name: string; elementKey: string; activityType: string; active: boolean; }
export abstract class UserActivityServiceConfig { userActivityServiceUrl: string; }

@Injectable()
export class UserActivityService {
  private static readonly SERVICE_PATH = '/user-activity';
  public static readonly POLLING_INTERVAL_MS = 5000;
  private userActivityEvent: Subject<void>;
  private subscriptions: Subscription;
  private readonly userActivityStates = new Map<string, Set<string>>();

  constructor(private config: UserActivityServiceConfig, private messageBus: MessagingService, private httpProvider: HttpProviderService) {
  }

  start(...events: UserActivityEvent[]) {
    this.userActivityEvent = new Subject<void>();
    events.forEach((event) => {
      const subscription = this.messageBus.subscribe(event.name, (payload) => {
        if (payload && payload[event.elementKey]) {
          this.processUserActivityUpdate(payload[event.elementKey], event.activityType, event.active);
        } else {
          console.error(`failed to determine workspace element on receiving user activity event of type "${event.name}"` +
            `(payload empty, or missing field "${event.elementKey}")`, payload);
        }
      });
      if (this.subscriptions) {
        this.subscriptions.add(subscription);
      } else {
        this.subscriptions = subscription;
      }
    });
  }

  stop() {
    this.subscriptions.unsubscribe();
    this.userActivityEvent.next();
    this.userActivityEvent.complete();
  }

  private processUserActivityUpdate(elementId: string, activityType: string, active: boolean) {
    this.userActivityEvent.next();
    this.updateUserActivity(elementId, activityType, active);
    Observable.timer(0, UserActivityService.POLLING_INTERVAL_MS)
    .takeUntil(this.userActivityEvent)
    .subscribe(() => this.poll());
  }

  private updateUserActivity(elementId: string, activityType: string, active: boolean) {
    if (active) {
      this.addUserActivity(elementId, activityType);
    } else {
      this.removeUserActivity(elementId, activityType);
    }
  }

  private addUserActivity(elementId: string, activityType: string) {
    if (!this.userActivityStates.has(elementId)) {
      this.userActivityStates.set(elementId, new Set<string>());
    }
    this.userActivityStates.get(elementId).add(activityType);
  }

  private removeUserActivity(elementId: string, activityType: string) {
    if (this.userActivityStates.has(elementId)) {
      const activitySet = this.userActivityStates.get(elementId);
      activitySet.delete(activityType);
      if (activitySet.size === 0) {
        this.userActivityStates.delete(elementId);
      }
    }
  }

  private async poll(): Promise<void> {
    const http = await this.httpProvider.getHttpClient();
    const url = this.config.userActivityServiceUrl + UserActivityService.SERVICE_PATH;
    const payload = Array.from(this.userActivityStates, ([key, value]) => ({element: key, activities: Array.from(value)}));
    const response = await http.post(url, payload, { responseType: 'text' }).toPromise();
    this.broadcastCollaboratorActivity(response);
  }

  private broadcastCollaboratorActivity(activities: any): void {
    // TODO implement
  }


}
