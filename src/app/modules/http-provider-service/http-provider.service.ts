import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MessagingService } from '@testeditor/messaging-service';
import { HTTP_CLIENT_SUPPLIED } from '../event-types-in';
import { HTTP_CLIENT_NEEDED } from '../event-types-out';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/bindCallback';

@Injectable()
export class HttpProviderService {

  private httpClientPromise: Promise<HttpClient>;
  private httpClient: HttpClient;

  constructor(private messagingService: MessagingService) {
    const getObservable = Observable.bindCallback(this.retrieveHttpClient, (client: HttpClient) => client);
    this.httpClientPromise = getObservable(this.messagingService).toPromise();
  }

  async getHttpClient(): Promise<HttpClient> {
    if (!this.httpClient) {
        this.messagingService.publish(HTTP_CLIENT_NEEDED, null);
        this.httpClient = await this.httpClientPromise;
    }

    return this.httpClient;
  }

  private retrieveHttpClient(messagingService: MessagingService, callback: (client: HttpClient) => void): void {
    const responseSubscription = messagingService.subscribe(HTTP_CLIENT_SUPPLIED, (httpClientPayload) => {
      responseSubscription.unsubscribe();
      callback(httpClientPayload.httpClient);
    });
  }

}
