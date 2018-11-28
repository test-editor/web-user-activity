import { TestBed, inject, fakeAsync } from '@angular/core/testing';

import { HttpProviderService } from './http-provider.service';
import { MessagingService, MessagingModule } from '@testeditor/messaging-service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('HttpProviderService', () => {
  let messagingService: MessagingService;
  let httpClient: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        HttpClientModule,
        MessagingModule.forRoot()
      ],
      providers: [HttpProviderService]
    });
    messagingService = TestBed.get(MessagingService);
    httpClient = TestBed.get(HttpClient);

    const subscription = messagingService.subscribe('httpClient.needed', () => {
      subscription.unsubscribe();
      messagingService.publish('httpClient.supplied', { httpClient: httpClient });
    });
  });

  it('should be created', inject([HttpProviderService], (service: HttpProviderService) => {
    expect(service).toBeTruthy();
  }));

  it('should return http client', fakeAsync(inject([HttpProviderService], (serviceUnderTest: HttpProviderService) => {
    // when
    const httpPromise = serviceUnderTest.getHttpClient();

    // then
    httpPromise.then((actualClient) => {
      expect(actualClient).toEqual(httpClient);
    });
  })));

  it('should use cached value', fakeAsync(inject([HttpProviderService], (serviceUnderTest: HttpProviderService) => {
    // given
    serviceUnderTest.getHttpClient().then(() => {
      let calledSecondTime = false;
      const subscription = messagingService.subscribe('httpClient.needed', () => {
        subscription.unsubscribe();
        calledSecondTime = true;
        messagingService.publish('httpClient.supplied', { httpClient: httpClient });
      });

      // when
      const secondHttpPromise = serviceUnderTest.getHttpClient();

      // then
      expect(calledSecondTime).toBeFalsy();
      secondHttpPromise.then((actualClient) => {
        expect(actualClient).toEqual(httpClient);
      });
    });
  })));
});
