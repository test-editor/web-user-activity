import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserActivityService } from './user-activity.service';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [],
  providers: [UserActivityService]
})
export class UserActivityModule { }
