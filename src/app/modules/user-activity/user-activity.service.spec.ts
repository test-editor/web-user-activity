import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { fakeAsync, inject, TestBed, tick } from '@angular/core/testing';
import { MessagingService } from '@testeditor/messaging-service';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { HttpProviderService } from '@testeditor/testeditor-commons';
import { UserActivityEvent, UserActivityService, UserActivityServiceConfig } from './user-activity.service';
import { ElementActivity, USER_ACTIVITY_UPDATED } from '../event-types-out';


describe('UserActivityService', () => {
  const dummyUrl = 'http://localhost:9080';
  const serviceConfig: UserActivityServiceConfig = { userActivityServiceUrl: dummyUrl };
  const messageBusMock: MessagingService = mock(MessagingService);
  const httpProviderMock: HttpProviderService = mock(HttpProviderService);
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserActivityService, MessagingService,
        { provide: HttpProviderService, useValue: instance(httpProviderMock) },
        { provide: UserActivityServiceConfig, useValue: serviceConfig }
      ]
    });

    httpClient = TestBed.get(HttpClient);
    httpTestingController = TestBed.get(HttpTestingController);
    when(httpProviderMock.getHttpClient()).thenResolve(httpClient);
  });

  it('should be created', inject([UserActivityService], (service: UserActivityService) => {
    expect(service).toBeTruthy();
  }));

  it('should register to provided message bus events on start', () => {
    // given
    const service = new UserActivityService(serviceConfig, instance(messageBusMock), instance(httpProviderMock));
    const eventName1 = 'user.activity.event';
    const eventName2 = 'another.event';
    const userActivityEvent1: UserActivityEvent = { name: eventName1, active: true, activityType: '', elementKey: '' };
    const userActivityEvent2: UserActivityEvent = { name: eventName2, active: true, activityType: '', elementKey: '' };

    // when
    service.start(userActivityEvent1, userActivityEvent2);

    // then
    verify(messageBusMock.subscribe(eventName1, anything())).once();
    verify(messageBusMock.subscribe(eventName2, anything())).once();
    expect().nothing();
  });

  it('should send user activity polling request when receiving user activity event',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const eventName = 'user.activity.event';
      const userActivityEvent: UserActivityEvent = { name: eventName, active: true, activityType: 'sampleType', elementKey: 'path' };
      service.start(userActivityEvent);

      // when
      messageBus.publish(eventName, { path: '/path/to/workspace/element.ext' });
      tick();

      // then
      const request = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` });
      request.flush('response');
      httpTestingController.verify();
      expect(request.request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['sampleType'] }]);

      // cleanup
      service.stop();
    })));

  it('should list all activity types for an element when corresponding user activity events were received',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const eventName1 = 'user.activity.event';
      const eventName2 = 'different.user.activity.event';
      const userActivityEvent1: UserActivityEvent = { name: eventName1, active: true, activityType: 'firstType', elementKey: 'path' };
      const userActivityEvent2: UserActivityEvent = { name: eventName2, active: true, activityType: 'differentType', elementKey: 'path' };
      service.start(userActivityEvent1, userActivityEvent2);

      // when
      messageBus.publish(eventName1, { path: '/path/to/workspace/element.ext' });
      tick();
      messageBus.publish(eventName2, { path: '/path/to/workspace/element.ext' });
      tick();

      // then
      const request = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      expect(request.length).toEqual(2);
      request[0].flush('response');
      request[1].flush('response');
      httpTestingController.verify();
      expect(request[0].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['firstType'] }]);
      expect(request[1].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['firstType', 'differentType'] }]);

      // cleanup
      service.stop();
    })));

    it('should remove previously recorded activity when a corresponding user activity event is received (active=false)',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const activityEvent = 'activity.signal';
      const inactivityEvent = 'inactivity.signal';
      const differentEvent = 'arbitrary.activity.event';
      const userActivityEvent: UserActivityEvent = { name: activityEvent, active: true, activityType: 'aType', elementKey: 'path' };
      const userInactivityEvent: UserActivityEvent = { name: inactivityEvent, active: false, activityType: 'aType', elementKey: 'path' };
      const differentUserActivityEvent: UserActivityEvent = {
        name: differentEvent, active: true, activityType: 'anotherType', elementKey: 'path' };
      service.start(userActivityEvent, userInactivityEvent, differentUserActivityEvent);

      // when
      messageBus.publish(activityEvent, { path: '/path/to/workspace/element.ext' });
      tick();
      messageBus.publish(differentEvent, { path: '/path/to/workspace/element.ext' });
      tick();
      messageBus.publish(inactivityEvent, { path: '/path/to/workspace/element.ext' });
      tick();

      // then
      const request = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      expect(request.length).toEqual(3);
      request[0].flush('response');
      request[1].flush('response');
      request[2].flush('response');
      httpTestingController.verify();
      expect(request[0].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType'] }]);
      expect(request[1].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType', 'anotherType'] }]);
      expect(request[2].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['anotherType'] }]);

      // cleanup
      service.stop();
    })));

  it('should start polling periodically after being started',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const userActivityEvent: UserActivityEvent = { name: 'some.event', active: true, activityType: 'sampleType', elementKey: 'path' };

      // when
      service.start(userActivityEvent);
      tick(3 * UserActivityService.POLLING_INTERVAL_MS);

      // then
      const requests = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      expect(requests.length).toEqual(4);
      requests.forEach((testRequest) => {
        expect(testRequest.request.body).toEqual([]);
      });
      requests[0].flush('response');
      requests[1].flush('response');
      requests[2].flush('response');
      requests[3].flush('response');
      httpTestingController.verify();

      // cleanup
      service.stop();
    })));

  it('should interrupt, and then resume, periodic polling on receiving new user activity event',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const eventName = 'user.activity.event';
      const userActivityEvent: UserActivityEvent = { name: eventName, active: true, activityType: 'sampleType', elementKey: 'path' };
      service.start(userActivityEvent);

      messageBus.publish(eventName, { path: '/path/to/workspace/element.ext' });
      tick(1.5 * UserActivityService.POLLING_INTERVAL_MS);
      const requests = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      expect(requests.length).toEqual(2);
      requests[0].flush('response');
      requests[1].flush('response');
      httpTestingController.verify();

      // when
      messageBus.publish(eventName, { path: '/path/to/different/workspace/element.ext' });
      tick(0.75 * UserActivityService.POLLING_INTERVAL_MS);

      // then
      const requestAfter = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` });
      requestAfter.flush('response');
      expect(requestAfter.request.body).toEqual([
        { element: '/path/to/workspace/element.ext', activities: ['sampleType'] },
        { element: '/path/to/different/workspace/element.ext', activities: ['sampleType'] }]);

      // cleanup
      service.stop();
    })));


    it('should publish activities of collaborating users on the message bus when receiving update from server',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      let actualPayload: ElementActivity[];
      messageBus.subscribe(USER_ACTIVITY_UPDATED, payload => actualPayload = payload);
      const serverUpdate: ElementActivity[] = [{
        element: '/path/to/file/collaborator/worksOn.ext',
        activities: [
          { user: 'John Doe', type: 'openedFile'},
          { user: 'John Doe', type: 'typesIntoFile'},
          { user: 'Jane Doe', type: 'deletedElement'}]
      }];
      const userActivityEvent: UserActivityEvent = { name: 'some.event', active: true, activityType: 'sampleType', elementKey: 'path' };
      service.start(userActivityEvent);
      messageBus.publish('some.event', { path: '/path/to/workspace/element.ext' });
      tick();
      const request = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` });

      // when
      request.flush(serverUpdate);
      tick();

      // then
      expect(actualPayload).toEqual(serverUpdate);

      // cleanup
      service.stop();
    })));

    it('should send one final request with an empty list of activities to the server when being stopped',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const eventName = 'user.activity.event';
      const userActivityEvent: UserActivityEvent = { name: eventName, active: true, activityType: 'sampleType', elementKey: 'path' };
      service.start(userActivityEvent);
      tick();
      // starting the service will immediately result in a request, which we're not interested in here, but the mock has to respond to it
      const initialRequest = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` }, 'initial request');
      initialRequest.flush('response');
      httpTestingController.verify();

      // signal activity to ensure that final request isn't just empty "by accident"
      messageBus.publish(eventName, { path: '/path/to/workspace/element.ext' });
      tick();
      const requestOnChange = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` }, 'request on change');
      requestOnChange.flush('response');
      httpTestingController.verify();
      expect(requestOnChange.request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['sampleType'] }]);

      // when
      service.stop();
      tick();

      // then
      const signOffRequest = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` }, 'request to sign off');
      signOffRequest.flush('response');
      httpTestingController.verify();
      expect(signOffRequest.request.body).toEqual([]);
    })));

    it('should remove previously recorded activity automatically when a timeout was given',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const activityEvent = 'activity.signal';
      const userActivityEvent = { name: activityEvent, active: true, activityType: 'aType', elementKey: 'path', timeout: 7 };
      service.start(userActivityEvent);
      tick();

      // when
      messageBus.publish(activityEvent, { path: '/path/to/workspace/element.ext' });

      // then
      tick(6000);
      const requests = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      expect(requests.length).toEqual(3);
      requests[0].flush('response'); // request sent right after 'start(…)'
      requests[1].flush('response'); // request sent right after message bus event (resetting polling interval)
      requests[2].flush('response'); // request sent five seconds after the previous one (periodic polling)
      httpTestingController.verify();
      expect((requests[0].request.body as Array<ElementActivity>).length).toEqual(0);
      expect(requests[1].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType'] }]);
      expect(requests[2].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType'] }]);

      tick(4000); // total time passed is now 10 secs: another poll request has just occurred, but the activity has timed out 3 secs ago
      const requestAfterTimeout = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` });
      requestAfterTimeout.flush('response');
      httpTestingController.verify();
      expect((requestAfterTimeout.request.body as Array<ElementActivity>).length).toEqual(0);

      // cleanup
      service.stop();
    })));

    it('should reset the timer when receiving a second message bus event for an activity with a timeout within the interval',
    fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
      // given
      const activityEvent = 'activity.signal';
      const userActivityEvent = { name: activityEvent, active: true, activityType: 'aType', elementKey: 'path', timeout: 7 };
      service.start(userActivityEvent);
      tick();
      messageBus.publish(activityEvent, { path: '/path/to/workspace/element.ext' });

      tick(6000);
      const requests = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      expect(requests.length).toEqual(3);
      requests[0].flush('response'); // request sent right after 'start(…)'
      requests[1].flush('response'); // request sent right after message bus event (resetting polling interval)
      requests[2].flush('response'); // request sent five seconds after the previous one (periodic polling)
      httpTestingController.verify();

      // when
      messageBus.publish(activityEvent, { path: '/path/to/workspace/element.ext' }); // resets both polling interval and activity timeout

      // then
      tick(5000); // another poll request has just occurred, activity should remain for 2 more secs!
      const requestsBeforeTimeout = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
      requestsBeforeTimeout[0].flush('response'); // request sent right after second message bus event (resetting polling interval)
      requestsBeforeTimeout[1].flush('response'); // request sent five seconds after the previous one (periodic polling)
      httpTestingController.verify();
      expect(requestsBeforeTimeout[0].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType'] }]);
      expect(requestsBeforeTimeout[1].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType'] }]);

      tick(5000); // another poll request has just occurred, but the activity has timed out 3 secs ago
      const requestAfterTimeout = httpTestingController.expectOne({ method: 'POST', url: `${dummyUrl}/user-activity` });
      requestAfterTimeout.flush('response');
      httpTestingController.verify();
      expect((requestAfterTimeout.request.body as Array<ElementActivity>).length).toEqual(0);

      // cleanup
      service.stop();
      })));

      it('should allow multiple activities with a timeout for the same element',
      fakeAsync(inject([UserActivityService, MessagingService], (service: UserActivityService, messageBus: MessagingService) => {
        // given
        const firstEvent = 'first.event';
        const secondEvent = 'second.event';
        const userActivityEvents = [
           { name: firstEvent, active: true, activityType: 'aType', elementKey: 'path', timeout: 6 },
           { name: secondEvent, active: true, activityType: 'aSecondType', elementKey: 'path', timeout: 9 },
          ];
        service.start(...userActivityEvents);
        tick();

        // when
        messageBus.publish(firstEvent, { path: '/path/to/workspace/element.ext' });
        tick(1500);
        messageBus.publish(secondEvent, { path: '/path/to/workspace/element.ext' });
        tick(10000);

        // then
        const requests = httpTestingController.match({ method: 'POST', url: `${dummyUrl}/user-activity` });
        expect(requests.length).toEqual(5);
        requests[0].flush('response'); //  0.0s: request sent right after 'start(…)'
        requests[1].flush('response'); //  0.0s: request sent right after first message bus event (resetting polling interval)
        requests[2].flush('response'); //  1.5s: request sent right after second message bus event (resetting polling interval)
        requests[3].flush('response'); //  6.5s: periodic polling; 'aType' timed out 0.5s ago
        requests[4].flush('response'); // 11.5s: periodic polling; 'aSecondType' timed out 0.5s ago
        httpTestingController.verify();
        expect((requests[0].request.body as Array<ElementActivity>).length).toEqual(0);
        expect(requests[1].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType'] }]);
        expect(requests[2].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aType', 'aSecondType'] }]);
        expect(requests[3].request.body).toEqual([{ element: '/path/to/workspace/element.ext', activities: ['aSecondType'] }]);
        expect((requests[4].request.body as Array<ElementActivity>).length).toEqual(0);

        // cleanup
        service.stop();
      })));

});
