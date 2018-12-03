import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserActivityService } from './user-activity.service';
import { HttpProviderService } from '@testeditor/testeditor-commons';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [],
  providers: [UserActivityService, HttpProviderService]
})
export class UserActivityModule { }
